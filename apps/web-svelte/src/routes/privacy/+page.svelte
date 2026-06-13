<script lang="ts">
  // Single-language (pl) legal content. Mirrors docs/legal/privacy-policy.md -
  // keep both in sync. Prose is hardcoded rather than per-paragraph i18n keys
  // because this is a single-locale legal page and would otherwise bloat pl.json.
  import * as m from "$lib/paraglide/messages";
</script>

<svelte:head>
  <title>{m.privacy_policy_link()} · Portfelik</title>
</svelte:head>

<main class="mx-auto min-h-screen max-w-2xl px-4 py-10 text-slate-200">
  <a href="/" class="text-accent text-sm hover:underline">← Portfelik</a>

  <h1 class="mt-4 text-2xl font-semibold tracking-tight text-slate-100">
    {m.privacy_policy_link()}
  </h1>
  <p class="mt-1 text-xs text-slate-400">Ostatnia aktualizacja: 12 czerwca 2026</p>

  <p class="mt-6 text-sm leading-relaxed text-slate-300">
    Portfelik pomaga ogarniać domowe finanse. Żeby działać, musi przechowywać Twoje dane finansowe.
    Poniżej wyjaśniamy bez prawniczego żargonu: co przechowujemy, kto to widzi i co możesz z tym
    zrobić.
  </p>
  <p class="mt-3 text-sm leading-relaxed text-slate-300">
    <strong>Administrator danych:</strong> Adrian Zinko (kontakt: adres e-mail widoczny w koncie Portfelik
    / zaproszeniach do aplikacji).
  </p>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Co przechowujemy</h2>
    <ul class="list-disc space-y-1 pl-5 text-sm text-slate-300">
      <li><strong>Twoje transakcje</strong> - kwoty, daty, opisy, kategorie.</li>
      <li>
        <strong>Twoje plany</strong> - budżety, cele oszczędnościowe, kredyty i ich powiązania z transakcjami.
      </li>
      <li><strong>Opcjonalny wpis majątku</strong> - jeśli go dodasz.</li>
      <li><strong>Twój profil</strong> - e-mail logowania i ustawienia.</li>
      <li><strong>Grupy</strong> - do których należysz, wraz z e-mailami zapraszanych osób.</li>
      <li>
        <strong>Powiadomienia</strong> - ich treść oraz, jeśli włączysz push, techniczny token urządzenia
        (służy wyłącznie do dostarczania powiadomień).
      </li>
    </ul>
    <p class="text-sm leading-relaxed text-slate-300">
      Pliki z banku po imporcie zamieniamy w transakcje. Samego pliku nie przechowujemy.
    </p>
  </section>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Kto widzi Twoje dane</h2>
    <ul class="list-disc space-y-1 pl-5 text-sm text-slate-300">
      <li><strong>Ty.</strong> Domyślnie wszystko jest prywatne.</li>
      <li>
        <strong>Osoby z Twojej grupy</strong> - ale tylko to, co sam(a) oznaczysz jako wspólne. Szczegóły
        Twoich importów z banku zawsze zostają tylko u Ciebie.
      </li>
      <li>
        <strong>Nikt inny.</strong> Inni użytkownicy aplikacji nie mają dostępu do Twoich danych.
      </li>
    </ul>
  </section>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">A twórca aplikacji?</h2>
    <p class="text-sm leading-relaxed text-slate-300">
      Mówiąc szczerze: dane nie są szyfrowane end-to-end, więc osoba utrzymująca aplikację
      technicznie ma dostęp do bazy danych. W praktyce narzędzia administracyjne ukrywają kwoty i
      opisy, a do surowych danych sięgamy tylko wtedy, gdy to konieczne - np. żeby naprawić błąd.
      Nie przeglądamy Twoich finansów. Nigdy ich też nikomu nie udostępnimy ani nie sprzedamy.
    </p>
  </section>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Gdzie są Twoje dane</h2>
    <p class="text-sm leading-relaxed text-slate-300">
      U dwóch dostawców infrastruktury: <strong>Supabase</strong> (baza danych i logowanie) oraz
      <strong>Cloudflare</strong> (hosting aplikacji). Obaj szyfrują dane na swoich serwerach i mają własne
      polityki prywatności dla swojej warstwy.
    </p>
  </section>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Jak długo je trzymamy</h2>
    <p class="text-sm leading-relaxed text-slate-300">
      Tak długo, jak masz konto. Gdy usuniesz konto, wszystkie Twoje dane są trwale kasowane.
    </p>
  </section>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Twoje dane są Twoje</h2>
    <p class="text-sm leading-relaxed text-slate-300">
      W <strong>Ustawienia → Profil</strong> możesz w każdej chwili pobrać komplet swoich danych (plik
      JSON) lub usunąć konto razem ze wszystkimi danymi. Eksport transakcji do CSV znajdziesz na ekranie
      Transakcje. Jeśli prowadzisz grupę, przed usunięciem konta przekaż ją komuś albo rozwiąż.
    </p>
  </section>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Pytania i Twoje prawa</h2>
    <p class="text-sm leading-relaxed text-slate-300">
      Masz prawo zobaczyć swoje dane (eksport), poprawić je (edycja w aplikacji) i usunąć (usunięcie
      konta) - wszystko zrobisz bezpośrednio w aplikacji. W sprawach prywatności napisz do
      administratora na adres e-mail powiązany z kontem Portfelik.
    </p>
  </section>
</main>
