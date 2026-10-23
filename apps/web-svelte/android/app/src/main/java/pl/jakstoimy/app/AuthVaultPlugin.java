package pl.jakstoimy.app;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Installation-local Auth state. No plaintext file, logging, or backup export. */
@CapacitorPlugin(name = "AuthVault")
public class AuthVaultPlugin extends Plugin {
    private static final String ALIAS = "jakstoimy.auth.v1";

    private AtomicFile file() {
        return new AtomicFile(new File(getContext().getNoBackupFilesDir(), "auth-vault.v1"));
    }

    private SecretKey key(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        if (!create) throw new IllegalStateException("Missing installation key");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build());
        return generator.generateKey();
    }

    @PluginMethod
    public synchronized void read(PluginCall call) {
        try {
            AtomicFile target = file();
            if (!target.getBaseFile().exists() &&
                !new File(target.getBaseFile().getPath() + ".bak").exists()) {
                JSObject result = new JSObject();
                result.put("items", new JSObject());
                call.resolve(result);
                return;
            }
            byte[] encoded = target.readFully();
            if (encoded.length < 30 || encoded.length > 1048576 || encoded[0] != 1) {
                throw new IllegalStateException("Invalid vault");
            }
            byte[] iv = new byte[12];
            System.arraycopy(encoded, 1, iv, 0, iv.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, iv));
            byte[] plain = cipher.doFinal(encoded, 13, encoded.length - 13);
            JSObject result = new JSObject();
            result.put("items", new JSObject(new String(plain, StandardCharsets.UTF_8)));
            call.resolve(result);
        } catch (Exception error) {
            // Do not silently reset an unreadable identity and provision another demo.
            call.reject("auth_vault_unavailable");
        }
    }

    @PluginMethod
    public synchronized void write(PluginCall call) {
        FileOutputStream stream = null;
        AtomicFile target = file();
        try {
            JSObject items = call.getObject("items");
            if (items == null) throw new IllegalArgumentException("Missing items");
            byte[] plain = items.toString().getBytes(StandardCharsets.UTF_8);
            if (plain.length > 1048000) throw new IllegalArgumentException("Vault too large");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(true));
            byte[] encrypted = cipher.doFinal(plain);
            byte[] encoded = ByteBuffer.allocate(13 + encrypted.length)
                .put((byte) 1).put(cipher.getIV()).put(encrypted).array();
            stream = target.startWrite();
            stream.write(encoded);
            target.finishWrite(stream);
            call.resolve();
        } catch (Exception error) {
            if (stream != null) target.failWrite(stream);
            call.reject("auth_vault_unavailable");
        }
    }
}
