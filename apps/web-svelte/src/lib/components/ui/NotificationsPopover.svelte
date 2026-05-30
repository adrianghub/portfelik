<script lang="ts">
  import { goto } from "$app/navigation";
  import { Bell, X, CheckCheck, Check, RotateCcw } from "lucide-svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
  import Sheet from "$lib/components/ui/Sheet.svelte";
  import {
    fetchNotifications,
    markNotificationRead,
    markNotificationUnread,
    markAllNotificationsRead,
    deleteNotification,
  } from "$lib/services/notifications";
  import { formatDate } from "$lib/utils";
  import type { Notification } from "$lib/types";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    /** "top" = popover opens downward (desktop header); "bottom" = opens upward (mobile nav) */
    placement?: "top" | "bottom";
    /** Class for the trigger button (mobile nav needs tab-style sizing) */
    buttonClass?: string;
  }
  let { placement = "top", buttonClass }: Props = $props();

  const isDesktop = new MediaQuery("(min-width: 640px)");
  const popoverPositionClass = $derived(
    placement === "bottom" ? "bottom-full right-0 mb-2" : "top-10 right-0"
  );

  const queryClient = useQueryClient();

  let open = $state(false);

  const query = createQuery(() => ({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    staleTime: 30_000,
  }));

  const notifications = $derived(query.data ?? []);
  const unreadCount = $derived(notifications.filter((n) => !n.read_at).length);

  const markReadMutation = createMutation(() => ({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  }));

  const markUnreadMutation = createMutation(() => ({
    mutationFn: (id: string) => markNotificationUnread(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  }));

  const markAllMutation = createMutation(() => ({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  }));

  const deleteMutation = createMutation(() => ({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  }));

  function handleOpen() {
    open = !open;
    if (open) queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  function handleClickOutside(e: MouseEvent) {
    if (!isDesktop.current) return;
    const target = e.target as HTMLElement;
    if (!target.closest("[data-notif-popover]")) open = false;
  }

  function formatRelativeDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 60) return `${diffMin || 1} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    return formatDate(dateStr);
  }

  function targetHref(notification: Notification): string | null {
    switch (notification.type) {
      case "group_invitation":
        return "/settings?tab=groups";
      case "transaction_upcoming":
      case "transaction_overdue":
      case "transaction_reminder": {
        const data = notification.data;
        const txId = data && "transactionId" in data ? data.transactionId : null;
        return txId ? `/transactions?txId=${txId}` : "/transactions";
      }
      case "transaction_summary":
        return "/transactions";
      default:
        return null;
    }
  }

  function handleNotificationClick(notification: Notification) {
    if (!notification.read_at) markReadMutation.mutate(notification.id);
    const href = targetHref(notification);
    if (href) {
      open = false;
      void goto(href);
    }
  }

  function toggleRead(notification: Notification) {
    if (notification.read_at) markUnreadMutation.mutate(notification.id);
    else markReadMutation.mutate(notification.id);
  }

  const actionBtnClass = $derived(
    isDesktop.current
      ? "rounded-md p-1 text-slate-500 transition-colors hover:bg-white/5 disabled:opacity-40"
      : "rounded-lg p-2.5 text-slate-400 transition-colors hover:bg-white/5 disabled:opacity-40"
  );
</script>

{#snippet panel()}
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div class="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3">
      <h2 id="notifications-panel-title" class="text-eyebrow text-slate-300">
        {m.notifications_title()}
      </h2>
      {#if unreadCount > 0}
        <button
          type="button"
          onclick={() => markAllMutation.mutate()}
          disabled={markAllMutation.isPending}
          class="text-accent hover:text-accent flex items-center gap-1 text-xs transition-colors disabled:opacity-40"
        >
          <CheckCheck size={12} />
          {m.notifications_mark_all_read()}
        </button>
      {/if}
    </div>

    <ul
      class="min-h-0 flex-1 divide-y divide-white/5 overflow-y-auto {isDesktop.current
        ? 'max-h-80'
        : ''}"
    >
      {#if query.isLoading}
        {#each [0, 1, 2] as _, i (i)}
          <li class="px-4 py-3">
            <div class="h-3 w-3/4 animate-pulse rounded bg-slate-800/60"></div>
            <div class="mt-1.5 h-2 w-1/2 animate-pulse rounded bg-slate-800/60"></div>
          </li>
        {/each}
      {:else if notifications.length === 0}
        <li class="px-4 py-8 text-center text-sm text-slate-500">
          {m.notifications_empty()}
        </li>
      {:else}
        {#each notifications as n (n.id)}
          {@const isUnread = !n.read_at}
          <li
            class="group relative flex gap-3 px-4 py-3 transition-colors hover:bg-white/5 {isUnread
              ? 'bg-accent/5'
              : ''}"
          >
            {#if isUnread}
              <div
                class="bg-accent-gradient mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full shadow-[0_0_8px_var(--color-accent-glow)]"
              ></div>
            {:else}
              <div class="mt-1.5 h-1.5 w-1.5 shrink-0"></div>
            {/if}
            <div class="min-w-0 flex-1">
              <button
                type="button"
                onclick={() => handleNotificationClick(n)}
                class="block w-full text-left"
              >
                <p class="truncate text-xs font-medium text-slate-100">
                  {n.title}
                </p>
                <p class="mt-0.5 line-clamp-2 text-xs text-slate-400">
                  {n.body}
                </p>
              </button>
              <span class="mt-1 block text-[10px] text-slate-500">
                {formatRelativeDate(n.created_at)}
              </span>
            </div>
            <div class="flex shrink-0 items-start gap-0.5">
              <button
                type="button"
                onclick={() => toggleRead(n)}
                disabled={markReadMutation.isPending || markUnreadMutation.isPending}
                class="{actionBtnClass} hover:text-accent"
                aria-label={isUnread ? m.notifications_mark_read() : m.notifications_mark_unread()}
                title={isUnread ? m.notifications_mark_read() : m.notifications_mark_unread()}
              >
                {#if isUnread}
                  <Check size={isDesktop.current ? 13 : 16} />
                {:else}
                  <RotateCcw size={isDesktop.current ? 13 : 16} />
                {/if}
              </button>
              <button
                type="button"
                onclick={() => deleteMutation.mutate(n.id)}
                disabled={deleteMutation.isPending}
                class="{actionBtnClass} hover:bg-rose-500/10 hover:text-rose-300"
                aria-label={m.common_delete()}
                title={m.common_delete()}
              >
                <X size={isDesktop.current ? 13 : 16} />
              </button>
            </div>
          </li>
        {/each}
      {/if}
    </ul>
  </div>
{/snippet}

<svelte:window onclick={handleClickOutside} />

<div class="relative" data-notif-popover>
  <button
    type="button"
    onclick={handleOpen}
    class={buttonClass ??
      "focus-visible:ring-accent relative flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-slate-100 focus-visible:ring-2 focus-visible:outline-none"}
    aria-label={m.notifications_title()}
  >
    <Bell size={17} aria-hidden="true" />
    {#if unreadCount > 0}
      <span
        class="bg-accent-gradient absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-slate-900"
      >
        {unreadCount > 9 ? "9+" : unreadCount}
      </span>
    {/if}
  </button>

  {#if open && isDesktop.current}
    <div
      class="absolute {popoverPositionClass} z-50 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-white/5 bg-slate-900/95 shadow-[0_0_40px_rgba(0,0,0,0.4)] backdrop-blur"
      role="dialog"
      aria-label={m.notifications_title()}
    >
      {@render panel()}
    </div>
  {/if}
</div>

{#if !isDesktop.current}
  <Sheet {open} flush labelledBy="notifications-panel-title" onclose={() => (open = false)}>
    {@render panel()}
  </Sheet>
{/if}
