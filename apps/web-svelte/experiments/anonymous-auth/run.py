#!/usr/bin/env python3
"""Disposable local DB + Auth + REST. Never changes the normal stack or a remote project."""
import base64
import hashlib
import hmac
import http.client
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
DB_CONTAINER = 'supabase_db_portfelik'
AUTH_CONTAINER = 'supabase_auth_portfelik'
REST_CONTAINER = 'supabase_rest_portfelik'
AUTH_IMAGE = 'public.ecr.aws/supabase/gotrue:v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b'

class Docker(http.client.HTTPConnection):
    def __init__(self):
        super().__init__('localhost')
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect('/var/run/docker.sock')

def docker(method, path, body=None):
    c = Docker()
    c.request(method, '/v1.47' + path, body=json.dumps(body) if body is not None else None,
              headers={'Content-Type': 'application/json'})
    response = c.getresponse()
    raw = response.read()
    c.close()
    if response.status >= 300:
        raise RuntimeError(f'Local Docker {method} {path}: HTTP {response.status}')
    return json.loads(raw) if raw else None

def sql(statement, database, privileged=False):
    prefix = ['docker', '--host=unix:///var/run/docker.sock', 'exec', '-i', DB_CONTAINER]
    if privileged:
        prefix += ['sh', '-c', 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql "$@"', 'poc-sql']
    else:
        prefix += ['psql']
    return subprocess.check_output(prefix + [
        '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin' if privileged else 'postgres', '-d', database,
    ], input=statement.encode()).decode()

def main():
    # All mutations target a random disposable database on this local Docker socket.
    suffix = secrets.token_hex(6)
    database = 'jakstoimy_auth_poc_' + suffix
    created = []
    db_created = False
    dump = Path('/tmp') / (database + '.dump')
    toc = Path('/tmp') / (database + '.toc')
    try:
        auth = docker('GET', f'/containers/{AUTH_CONTAINER}/json')
        rest = docker('GET', f'/containers/{REST_CONTAINER}/json')
        auth_env = dict(item.split('=', 1) for item in auth['Config']['Env'])
        rest_env = dict(item.split('=', 1) for item in rest['Config']['Env'])
        with dump.open('wb') as out:
            subprocess.run(['docker', '--host=unix:///var/run/docker.sock', 'exec', DB_CONTAINER,
                            'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '-Fc',
                            '--schema=public', '--schema=auth', '--schema=extensions', '--schema=vault'], stdout=out, check=True)
        sql(f'create database {database};', 'postgres')
        db_created = True
        sql("drop schema public;", database)
        subprocess.run(['docker', '--host=unix:///var/run/docker.sock', 'cp', str(dump),
                        f'{DB_CONTAINER}:/tmp/{database}.dump'], check=True, stdout=subprocess.DEVNULL)
        listing = subprocess.check_output(['docker', '--host=unix:///var/run/docker.sock', 'exec',
                                            DB_CONTAINER, 'pg_restore', '-l', f'/tmp/{database}.dump']).decode()
        # pg_cron is tied to the existing database; no scheduler/network extension in this copy.
        toc.write_text('\n'.join(line for line in listing.splitlines()
                                 if not any(x in line for x in ('EXTENSION - pg_cron', 'EXTENSION pg_cron',
                                                                'EXTENSION - pg_net', 'EXTENSION pg_net', 'SCHEMA cron', 'SCHEMA net', ' cron ', ' net ', 'graphql'))) + '\n')
        subprocess.run(['docker', '--host=unix:///var/run/docker.sock', 'cp', str(toc),
                        f'{DB_CONTAINER}:/tmp/{database}.toc'], check=True, stdout=subprocess.DEVNULL)
        subprocess.run(['docker', '--host=unix:///var/run/docker.sock', 'exec', DB_CONTAINER, 'sh', '-c',
                        'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_restore "$@"', 'poc-restore',
                        '--exit-on-error', '-U', 'supabase_admin', '-d', database,
                        '-L', f'/tmp/{database}.toc', f'/tmp/{database}.dump'], check=True)
        auth_history = subprocess.check_output(['docker', '--host=unix:///var/run/docker.sock', 'exec',
            DB_CONTAINER, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--data-only', '--table=auth.schema_migrations'])
        sql(auth_history.decode(), database, privileged=True)
        sql('create extension if not exists supabase_vault; create extension if not exists pgcrypto with schema extensions; create extension if not exists pg_trgm with schema extensions;', database, privileged=True)
        sql((HERE / 'hook.sql').read_text(), database)
        network = next(iter(auth['NetworkSettings']['Networks']))
        def launch(kind, image, env, port):
            name = f'{database}_{kind}'
            config = {
                'Image': image, 'Env': [f'{k}={v}' for k,v in env.items()],
                'ExposedPorts': {f'{port}/tcp': {}},
                'HostConfig': {'PortBindings': {f'{port}/tcp': [{'HostIp': '127.0.0.1', 'HostPort': ''}]}},
                'NetworkingConfig': {'EndpointsConfig': {network: {}}},
            }
            docker('POST', f'/containers/create?name={name}', config)
            created.append(name)
            docker('POST', f'/containers/{name}/start')
            info = docker('GET', f'/containers/{name}/json')
            host_port = info['NetworkSettings']['Ports'][f'{port}/tcp'][0]['HostPort']
            return f'http://127.0.0.1:{host_port}'
        auth_env.update({
            'GOTRUE_DB_DATABASE_URL': auth_env['GOTRUE_DB_DATABASE_URL'].replace('/postgres', '/' + database),
            'GOTRUE_DISABLE_SIGNUP': 'false',
            'GOTRUE_MAILER_AUTOCONFIRM': 'false',
            'GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED': 'true',
            'GOTRUE_EXTERNAL_EMAIL_ENABLED': 'true',
            'GOTRUE_HOOK_BEFORE_USER_CREATED_ENABLED': 'true',
            'GOTRUE_HOOK_BEFORE_USER_CREATED_URI': 'pg-functions://postgres/demo_auth_poc/before_user_created',
            'GOTRUE_RATE_LIMIT_ANONYMOUS_USERS': '1000',
            'GOTRUE_RATE_LIMIT_EMAIL_SENT': '1000',
            'GOTRUE_RATE_LIMIT_VERIFY': '1000',
            'GOTRUE_SMTP_MAX_FREQUENCY': '0',
        })
        rest_env['PGRST_DB_SCHEMAS'] = 'public'
        rest_env['PGRST_DB_URI'] = rest_env['PGRST_DB_URI'].replace('/postgres', '/' + database)
        auth_url = launch('auth', AUTH_IMAGE, auth_env, 9999)
        rest_url = launch('rest', rest['Config']['Image'], rest_env, 3000)
        # No secret printing or credential files; these are local API fixture keys, not user sessions.
        def jwt(role):
            def encode(value):
                return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b'=')
            data = encode({'alg':'HS256','typ':'JWT'}) + b'.' + encode({
                'role':role, 'iss':'supabase', 'iat':int(time.time()), 'exp':int(time.time())+3600})
            signature = hmac.new(auth_env['GOTRUE_JWT_SECRET'].encode(), data, hashlib.sha256).digest()
            return (data + b'.' + base64.urlsafe_b64encode(signature).rstrip(b'=')).decode()
        for url in (auth_url + '/health', rest_url + '/'):
            for attempt in range(100):
                try:
                    urllib.request.urlopen(urllib.request.Request(url, headers={'Authorization': 'Bearer ' + jwt('anon')}), timeout=1).close()
                    break
                except Exception:
                    time.sleep(0.2)
            else:
                for name in created:
                    logs = subprocess.run(['docker', '--host=unix:///var/run/docker.sock', 'logs', '--tail', '8', name], capture_output=True, text=True)
                    output = logs.stdout + logs.stderr
                    for key, value in {**auth_env, **rest_env}.items():
                        if len(value) > 12 and any(word in key for word in ('SECRET', 'PASSWORD', 'KEY', 'DATABASE_URL', 'DB_URI')):
                            output = output.replace(value, '[redacted]')
                    print(output, flush=True)
                raise RuntimeError('Disposable local service did not become healthy: ' + url)
        test_env = {**os.environ, 'POC_AUTH_URL':auth_url, 'POC_REST_URL':rest_url,
                    'POC_DATABASE':database, 'POC_ANON_KEY':jwt('anon'), 'POC_SERVICE_KEY':jwt('service_role')}
        print('Disposable local Auth v2.197.0 + schema copy ready; normal stack unchanged.', flush=True)
        command = 'pnpm exec vitest run --config experiments/anonymous-auth/vitest.config.ts'
        activation = Path('/workspace/.cloud-setup/activate.sh')
        if activation.exists():
            command = 'source ' + str(activation) + '\n' + command
        result = subprocess.run(['bash', '-lc', command],
                                cwd=ROOT / 'apps/web-svelte', env=test_env)
        if result.returncode:
            logs = subprocess.run(['docker', '--host=unix:///var/run/docker.sock', 'logs', '--tail', '200', created[0]], capture_output=True, text=True)
            lines = (logs.stdout + logs.stderr).splitlines()
            for line in lines:
                try:
                    item = json.loads(line)
                except ValueError:
                    continue
                if item.get('level') not in ('error', 'fatal'):
                    continue
                output = json.dumps({k:item[k] for k in ('msg','error') if k in item})
                for key, value in auth_env.items():
                    if len(value) > 12 and any(word in key for word in ('SECRET', 'PASSWORD', 'KEY', 'DATABASE_URL')):
                        output = output.replace(value, '[redacted]')
                print(output)
        return result.returncode
    finally:
        for name in reversed(created):
            docker('DELETE', f'/containers/{name}?force=true')
        if db_created:
            sql(f'drop database {database} with (force);', 'postgres')
            subprocess.run(['docker', '--host=unix:///var/run/docker.sock', 'exec', DB_CONTAINER,
                            'rm', '-f', f'/tmp/{database}.dump', f'/tmp/{database}.toc'], check=True)
        dump.unlink(missing_ok=True)
        toc.unlink(missing_ok=True)
        print('Only disposable experiment containers/database removed; normal stack unchanged.', flush=True)

if __name__ == '__main__':
    raise SystemExit(main())
