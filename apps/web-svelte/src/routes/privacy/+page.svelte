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
  <p class="mt-1 text-xs text-slate-400">Ostatnia aktualizacja: 7 czerwca 2026</p>

  <p class="mt-6 text-sm leading-relaxed text-slate-300">
    Portfelik jest aplikacją do zarządzania finansami osobistymi. Poniżej prostym językiem
    opisujemy, jakie dane przechowujemy, dlaczego, kto technicznie ma do nich dostęp oraz jakie masz
    prawa.
  </p>
  <p class="mt-3 text-sm leading-relaxed text-slate-300">
    <strong>Administrator danych:</strong> Adrian Zinko (kontakt: adres e-mail widoczny w koncie Portfelik
    / zaproszeniach do aplikacji).
  </p>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Jakie dane przechowujemy</h2>
    <ul class="list-disc space-y-1 pl-5 text-sm text-slate-300">
      <li>
        <strong>Transakcje</strong> — kwota, waluta, data, opis, kategoria, typ oraz oznaczenie czy wpis
        jest prywatny, czy współdzielony w grupie.
      </li>
      <li>
        <strong>Importy z banku</strong> — wgrane CSV przetwarzamy na transakcje; przechowujemy metadane
        sesji importu. Surowe pliki nie są trwale archiwizowane po zatwierdzeniu.
      </li>
      <li>
        <strong>Plany</strong> — budżety wydatków, cele oszczędnościowe, kredyty oraz powiązania z transakcjami
        (rozliczenie).
      </li>
      <li>
        <strong>Warunki kredytu</strong> — saldo, oprocentowanie, rata (wpisy ręczne).
      </li>
      <li>
        <strong>Majątek netto</strong> — opcjonalny wpis gotówki, inwestycji i nieruchomości; nie pochodzi
        z importu bankowego.
      </li>
      <li>
        <strong>Grupy i zaproszenia</strong> — członkostwo, role (właściciel, współwłaściciel, członek)
        oraz e-mail zaproszonej osoby.
      </li>
      <li>
        <strong>Profil</strong> — e-mail, ustawienia (w tym przypomnienia o imporcie), rola konta.
      </li>
      <li>
        <strong>Powiadomienia</strong> — treść powiadomień oraz, opcjonalnie, token push urządzenia.
      </li>
    </ul>
  </section>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Współdzielenie w grupach</h2>
    <ul class="list-disc space-y-1 pl-5 text-sm text-slate-300">
      <li>Wszyscy członkowie widzą współdzielone transakcje i plany oraz mogą je rozliczać.</li>
      <li>Właściciel grupy i współwłaściciele mogą edytować współdzielone plany i transakcje.</li>
      <li>
        Zwykli członkowie nie edytują cudzych planów ani transakcji — tylko je oglądają i
        rozliczają.
      </li>
      <li>Import bankowy pozostaje u właściciela konta, który go wykonał.</li>
    </ul>
  </section>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Dlaczego przechowujemy dane surowe</h2>
    <p class="text-sm leading-relaxed text-slate-300">
      Surowe dane finansowe istnieją w produkcyjnej bazie, ponieważ są niezbędne do importów,
      kategoryzacji, podsumowań, pulpitu i rozliczania planów. Aplikacja
      <strong>nie jest szyfrowana end-to-end</strong> — ochrona polega na kontroli dostępu na poziomie
      konta i prywatności narzędzi administracyjnych.
    </p>
  </section>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Podmioty przetwarzające</h2>
    <p class="text-sm leading-relaxed text-slate-300">
      Infrastruktura: <strong>Supabase</strong> (baza, auth) oraz <strong>Cloudflare Pages</strong>
      (hosting aplikacji). Warstwa dostawców reguluje przetwarzanie po ich stronie.
    </p>
  </section>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Kto technicznie ma dostęp</h2>
    <ul class="list-disc space-y-1 pl-5 text-sm text-slate-300">
      <li>
        Dane chroni RLS — inni użytkownicy nie widzą Twoich danych poza współdzieleniem w grupie.
      </li>
      <li>E-mail innego użytkownika widzisz tylko w kontekście grupy / zaproszenia.</li>
      <li>Narzędzia administracyjne są maskujące — bez surowych kwot i opisów.</li>
      <li>
        Operator produkcyjny <strong>technicznie</strong> może odczytać dane surowe; dostęp jest ograniczony
        do osób, które go potrzebują.
      </li>
    </ul>
  </section>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Okres przechowywania</h2>
    <p class="text-sm leading-relaxed text-slate-300">
      Dane przechowujemy do usunięcia konta. Po usunięciu są trwale kasowane (kaskada z konta
      użytkownika).
    </p>
  </section>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Powiadomienia push</h2>
    <p class="text-sm leading-relaxed text-slate-300">
      Token subskrypcji push służy wyłącznie do dostarczenia powiadomień. Klucz VAPID nie
      identyfikuje Cię.
    </p>
  </section>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Usuwanie i eksport danych</h2>
    <p class="text-sm leading-relaxed text-slate-300">
      W <strong>Ustawienia → Profil</strong> możesz pobrać pełny eksport JSON (transakcje, kategorie,
      reguły, plany, warunki kredytów, grupy, importy, majątek netto, profil) lub usunąć konto. Eksport
      CSV transakcji jest na ekranie Transakcje. Właściciel grupy musi najpierw przekazać własność lub
      rozwiązać grupę.
    </p>
  </section>

  <section class="mt-8 space-y-2">
    <h2 class="text-base font-semibold text-slate-100">Twoje prawa</h2>
    <p class="text-sm leading-relaxed text-slate-300">
      Masz prawo dostępu (eksport), sprostowania (edycja w aplikacji), usunięcia (usunięcie konta)
      oraz ograniczenia zakresu wgrywanych danych. W sprawach prywatności skontaktuj się z
      administratorem pod e-mailem powiązanym z kontem Portfelik.
    </p>
  </section>
</main>
