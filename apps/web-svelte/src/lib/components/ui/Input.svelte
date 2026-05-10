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
    "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 focus:outline-none",
    "dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500",
    "disabled:cursor-not-allowed disabled:opacity-50",
    className
  )}
/>
