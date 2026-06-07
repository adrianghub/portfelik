<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { cn } from "$lib/utils";
  import { Check, ChevronDown, Plus } from "lucide-svelte";

  interface Props {
    value?: string;
    items: string[];
    id?: string;
    label?: string;
    placeholder?: string;
    showLabel?: boolean;
    emptyLabel?: string;
    createLabel?: (value: string) => string;
    allowCreate?: boolean;
    showAllOnFocus?: boolean;
    disabled?: boolean;
    /** Fired when an existing item is chosen (the selected display value). */
    onchange?: (value: string) => void;
    /**
     * Fired when the "create" affordance is committed instead of selecting an
     * existing item. When provided, the combobox does NOT set `value` itself -
     * the consumer owns the create + selection. When omitted, create falls back
     * to selecting the free-typed text as the value.
     */
    oncreate?: (value: string) => void;
  }

  const uid = $props.id();
  let {
    value = $bindable(""),
    items,
    id = `${uid}-combobox`,
    label = "",
    placeholder = "",
    showLabel = false,
    emptyLabel = m.combobox_empty(),
    createLabel = (v: string) => m.combobox_create({ value: v }),
    allowCreate = false,
    showAllOnFocus = true,
    disabled = false,
    onchange,
    oncreate,
  }: Props = $props();

  let open = $state(false);
  let activeIndex = $state(-1);
  let inputRef = $state<HTMLInputElement | null>(null);
  let typedSinceFocus = $state(false);
  let dropAnchorY = $state(0);
  let dropLeft = $state(0);
  let dropWidth = $state(0);
  let dropMaxHeight = $state(240);
  let dropAbove = $state(false);

  const DROPDOWN_PREFERRED_PX = 240;
  const VIEWPORT_PADDING_PX = 8;

  const uniqueItems = $derived(
    items.filter((item, index, all) => all.findIndex((candidate) => candidate === item) === index)
  );

  const filteredItems = $derived.by(() => {
    if (!open) return [] as string[];
    const query = value.trim().toLocaleLowerCase("pl");
    if (!query || (showAllOnFocus && !typedSinceFocus)) return uniqueItems;
    return uniqueItems.filter((item) => item.toLocaleLowerCase("pl").includes(query));
  });

  const trimmedValue = $derived(value.trim());
  const canCreate = $derived.by(() => {
    if (!allowCreate || !trimmedValue) return false;
    return !uniqueItems.some(
      (item) => item.toLocaleLowerCase("pl") === trimmedValue.toLocaleLowerCase("pl")
    );
  });
  const optionCount = $derived(filteredItems.length + (canCreate ? 1 : 0));

  function updateDropPosition() {
    if (!inputRef || typeof window === "undefined") return;
    const rect = inputRef.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewTop = vv?.offsetTop ?? 0;
    const viewLeft = vv?.offsetLeft ?? 0;
    const viewHeight = vv?.height ?? window.innerHeight;
    const viewBottom = viewTop + viewHeight;
    const spaceBelow = viewBottom - rect.bottom - VIEWPORT_PADDING_PX;
    const spaceAbove = rect.top - viewTop - VIEWPORT_PADDING_PX;
    dropAbove = spaceBelow < DROPDOWN_PREFERRED_PX && spaceAbove > spaceBelow;
    const available = Math.max(80, dropAbove ? spaceAbove : spaceBelow);
    dropMaxHeight = Math.min(DROPDOWN_PREFERRED_PX, available);
    dropLeft = rect.left - viewLeft;
    dropWidth = rect.width;
    dropAnchorY = dropAbove ? rect.top - 4 : rect.bottom + 4;
  }

  $effect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    const handler = () => {
      if (open) updateDropPosition();
    };
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    vv?.addEventListener("resize", handler);
    vv?.addEventListener("scroll", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
      vv?.removeEventListener("resize", handler);
      vv?.removeEventListener("scroll", handler);
    };
  });

  $effect(() => {
    void value;
    if (typeof document !== "undefined" && inputRef && document.activeElement !== inputRef) {
      open = false;
      typedSinceFocus = false;
    }
    activeIndex = optionCount > 0 ? Math.min(Math.max(activeIndex, 0), optionCount - 1) : -1;
    if (open) updateDropPosition();
  });

  function optionId(index: number) {
    return `${id}-option-${index}`;
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  function closeList() {
    open = false;
    activeIndex = -1;
    typedSinceFocus = false;
  }

  function openList() {
    if (disabled) return;
    open = true;
    typedSinceFocus = false;
    activeIndex = optionCount > 0 ? 0 : -1;
    updateDropPosition();
  }

  function selectValue(next: string) {
    value = next;
    onchange?.(next);
    closeList();
  }

  function createValue() {
    if (oncreate) {
      oncreate(trimmedValue);
      closeList();
    } else {
      selectValue(trimmedValue);
    }
  }

  function handleInput() {
    typedSinceFocus = true;
    open = true;
    updateDropPosition();
  }

  function selectActive() {
    if (activeIndex < 0) return;
    if (activeIndex < filteredItems.length) {
      selectValue(filteredItems[activeIndex]);
      return;
    }
    if (canCreate) createValue();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        closeList();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      open = true;
      typedSinceFocus = typedSinceFocus || !showAllOnFocus;
      activeIndex = optionCount > 0 ? Math.min(activeIndex + 1, optionCount - 1) : -1;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      open = true;
      activeIndex = optionCount > 0 ? Math.max(activeIndex - 1, 0) : -1;
    } else if (e.key === "Enter" && open && activeIndex >= 0) {
      e.preventDefault();
      selectActive();
    }
  }
</script>

<div class="relative w-full min-w-0 space-y-1">
  {#if showLabel}
    <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for={id}>{label}</label>
  {/if}
  <div class="relative">
    <input
      bind:this={inputRef}
      {id}
      type="text"
      bind:value
      {disabled}
      autocomplete="off"
      role="combobox"
      aria-controls={`${id}-options`}
      aria-expanded={open}
      aria-autocomplete="list"
      aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
      onfocus={openList}
      oninput={handleInput}
      onblur={() => setTimeout(() => closeList(), 150)}
      onkeydown={handleKeydown}
      {placeholder}
      class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 pr-9 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    />
    <ChevronDown
      size={14}
      aria-hidden="true"
      class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-400"
    />
    {#if open}
      <div
        use:portal
        id={`${id}-options`}
        class="fixed z-[100] overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-slate-900/95 py-1 shadow-md backdrop-blur"
        style="top: {dropAnchorY}px; left: {dropLeft}px; width: {dropWidth}px; max-height: {dropMaxHeight}px; transform: translateY({dropAbove
          ? '-100%'
          : '0'});"
        role="listbox"
        tabindex="-1"
        onpointerdown={(e) => e.preventDefault()}
      >
        {#if filteredItems.length === 0}
          <div class="px-3 py-2 text-sm text-slate-400">{emptyLabel}</div>
        {/if}
        {#each filteredItems as item, index (item)}
          <button
            type="button"
            role="option"
            id={optionId(index)}
            aria-selected={index === activeIndex}
            class={cn(
              "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-white/5",
              index === activeIndex && "bg-white/5"
            )}
            onclick={() => selectValue(item)}
            onmouseenter={() => (activeIndex = index)}
          >
            <span class="truncate text-slate-100">{item}</span>
            {#if item === value}
              <Check size={14} class="text-accent shrink-0" aria-hidden="true" />
            {/if}
          </button>
        {/each}
        {#if canCreate}
          {@const createIndex = filteredItems.length}
          <button
            type="button"
            role="option"
            id={optionId(createIndex)}
            aria-selected={createIndex === activeIndex}
            class={cn(
              "text-accent hover:bg-accent/10 flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
              createIndex === activeIndex && "bg-accent/10"
            )}
            onclick={() => createValue()}
            onmouseenter={() => (activeIndex = createIndex)}
          >
            <Plus size={14} class="shrink-0" aria-hidden="true" />
            <span class="truncate">{createLabel(trimmedValue)}</span>
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>
