<script lang="ts">
  import { cn } from "$lib/utils";

  interface Props {
    value?: string | number;
    oninput?: (e: Event) => void;
    onchange?: (e: Event) => void;
    onblur?: (e: FocusEvent) => void;
    type?: "text" | "number" | "email" | "password" | "search" | "date" | "tel" | "url";
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    required?: boolean;
    id?: string;
    name?: string;
    step?: string | number;
    min?: string | number;
    max?: string | number;
    autocomplete?: HTMLInputElement["autocomplete"];
    class?: string;
  }

  let {
    value = $bindable(),
    oninput,
    onchange,
    onblur,
    type = "text",
    placeholder,
    disabled = false,
    readonly = false,
    required = false,
    id,
    name,
    step,
    min,
    max,
    autocomplete,
    class: className,
  }: Props = $props();
</script>

<input
  {type}
  {placeholder}
  {disabled}
  {readonly}
  {required}
  {id}
  {name}
  {step}
  {min}
  {max}
  {autocomplete}
  bind:value
  {oninput}
  {onchange}
  {onblur}
  class={cn(
    "h-10 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500",
    "focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-50",
    className
  )}
/>
