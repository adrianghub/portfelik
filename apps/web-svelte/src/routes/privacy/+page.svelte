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
  <p class="mt-1 text-xs text-slate-400">Ostatnia aktualizacja: 5 czerwca 2026</p>

  <p class="mt-6 text-sm leading-relaxed text-slate-300">
    Portfelik jest aplikacją do zarządzania finansami osobistymi. Poniżej prostym językiem
    opisujemy, jakie dane przechowujemy, dlaczego, kto technicznie ma do nich dostęp oraz jakie masz
    prawa.
  </p>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Jakie dane przechowujemy</h2>
    <ul class="list-disc space-y-1 pl-5 text-sm text-slate-300">
      <li>
        <strong>Transakcje</strong> — kwota, waluta, data, opis, kontrahent, kategoria, typ oraz oznaczenie
        czy są prywatne, czy współdzielone w grupie.
      </li>
      <li>
        <strong>Importy z banku</strong> — wgrane pliki CSV są przetwarzane na transakcje; przechowujemy
        metadane sesji importu potrzebne do wykrywania duplikatów i podsumowań.
      </li>
      <li><strong>Plany</strong> — przyszłe zamiary finansowe.</li>
      <li>
        <strong>Grupy i zaproszenia</strong> — członkostwo, role oraz adres e-mail osoby zapraszanej (widoczny
        w ramach współdzielenia z grupą).
      </li>
      <li>
        <strong>Profil</strong> — e-mail logowania, ustawienia (w tym opcjonalne przypomnienia o imporcie),
        rola konta.
      </li>
      <li>
        <strong>Powiadomienia</strong> — treść powiadomień w aplikacji oraz, jeśli włączysz push, pseudonimowy
        token subskrypcji danego urządzenia.
      </li>
    </ul>
  </section>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Dlaczego przechowujemy dane surowe</h2>
    <p class="text-sm leading-relaxed text-slate-300">
      Surowe dane finansowe istnieją w produkcyjnej bazie, ponieważ są niezbędne do importów,
      kategoryzacji, podsumowań, pulpitu i przyszłego rozliczania planów. Aplikacja
      <strong>nie jest szyfrowana end-to-end</strong> — ochrona polega na kontroli dostępu na poziomie
      konta i prywatności narzędzi administracyjnych, a nie na kryptograficznym ukryciu danych przed operatorem.
    </p>
  </section>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Kto technicznie ma dostęp</h2>
    <ul class="list-disc space-y-1 pl-5 text-sm text-slate-300">
      <li>
        Dane chroni kontrola dostępu na poziomie konta (RLS). Inni użytkownicy nie widzą Twoich
        danych poza tymi celowo współdzielonymi w grupie.
      </li>
      <li>
        Jedyny e-mail widoczny dla innego użytkownika to e-mail powiązany ze współdzieleniem w
        grupie.
      </li>
      <li>
        Narzędzia administracyjne są <strong>maskujące</strong>: kwoty w przedziałach, opisy jako
        <code>[masked]</code>, e-maile jako <code>a***@domena</code>. Surowe szczegóły finansowe nie
        są dostępne przez zwykłe ekrany administracyjne.
      </li>
      <li>
        Mimo to operator produkcyjny (właściciel bazy / posiadacz klucza service-role)
        <strong>technicznie</strong> może odczytać dane surowe. Dostęp produkcyjny jest ograniczony do
        operatorów, którzy go potrzebują.
      </li>
    </ul>
  </section>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Powiadomienia push</h2>
    <p class="text-sm leading-relaxed text-slate-300">
      Jeśli włączysz powiadomienia push, przechowujemy pseudonimowy token subskrypcji przeglądarki,
      aby móc dostarczać powiadomienia. Klucz publiczny VAPID jest elementem standardu Web Push i
      nie identyfikuje Ciebie.
    </p>
  </section>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Usuwanie i eksport danych</h2>
    <p class="text-sm leading-relaxed text-slate-300">
      Możesz usunąć konto i dane z poziomu aplikacji (<strong>Ustawienia → Profil</strong>). Pełny
      eksport konta (JSON) obejmuje transakcje, kategorie, reguły, plany, grupy, konta bankowe i
      metadane sesji importu. Eksport transakcji do CSV pozostaje dostępny na ekranie Transakcje.
    </p>
  </section>
</main>
