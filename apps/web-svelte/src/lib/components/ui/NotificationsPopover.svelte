<script lang="ts">
  import { Bell, X, CheckCheck } from "lucide-svelte";
  import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
  import {
    fetchNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
  } from "$lib/services/notifications";
  import { formatDate } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    /** "top" = popover opens downward (desktop header); "bottom" = opens upward (mobile nav) */
    placement?: "top" | "bottom";
    /** Class for the trigger button (mobile nav needs tab-style sizing) */
    buttonClass?: string;
  }
  let { placement = "top", buttonClass }: Props = $props();

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
</script>

<svelte:window onclick={handleClickOutside} />

<div class="relative" data-notif-popover>
  <button
    type="button"
    onclick={handleOpen}
    class={buttonClass ??
      "relative flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"}
    aria-label={m.notifications_title()}
  >
    <Bell size={17} aria-hidden="true" />
    {#if unreadCount > 0}
      <span
        class="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-900 text-[9px] font-bold text-white dark:bg-white dark:text-zinc-900"
      >
        {unreadCount > 9 ? "9+" : unreadCount}
      </span>
    {/if}
  </button>

  {#if open}
    <div
      class="absolute {popoverPositionClass} z-50 w-80 rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      role="dialog"
      aria-label={m.notifications_title()}
    >
      <div class="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-700">
        <span class="text-sm font-medium text-zinc-900 dark:text-white">{m.notifications_title()}</span>
        {#if unreadCount > 0}
          <button
            onclick={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending}
            class="flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-white"
          >
            <CheckCheck size={12} />
            {m.notifications_mark_all_read()}
          </button>
        {/if}
      </div>

      <ul class="max-h-80 divide-y divide-zinc-50 overflow-y-auto dark:divide-zinc-800">
        {#if query.isLoading}
          {#each [0, 1, 2] as _, i (i)}
            <li class="px-4 py-3">
              <div class="h-3 w-3/4 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800"></div>
              <div class="mt-1.5 h-2 w-1/2 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800"></div>
            </li>
          {/each}
        {:else if notifications.length === 0}
          <li class="px-4 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">{m.notifications_empty()}</li>
        {:else}
          {#each notifications as n (n.id)}
            {@const isUnread = !n.read_at}
            <li
              class="group relative flex gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 {isUnread ? 'bg-blue-50 dark:bg-blue-950' : ''}"
            >
              {#if isUnread}
                <div class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-900 dark:bg-white"></div>
              {:else}
                <div class="mt-1.5 h-1.5 w-1.5 shrink-0"></div>
              {/if}
              <div class="min-w-0 flex-1">
                <button
                  onclick={() => {
                    if (isUnread) markReadMutation.mutate(n.id);
                  }}
                  class="block w-full text-left"
                  disabled={!isUnread}
                >
                  <p class="truncate text-xs font-medium text-zinc-900 dark:text-white">{n.title}</p>
                  <p class="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{n.body}</p>
                </button>
                <span class="mt-1 block text-[10px] text-zinc-400 dark:text-zinc-500">
                  {formatRelativeDate(n.created_at)}
                </span>
              </div>
              <button
                onclick={() => deleteMutation.mutate(n.id)}
                disabled={deleteMutation.isPending}
                class="absolute top-3 right-3 hidden p-0.5 text-zinc-300 transition-colors group-hover:block hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"
                aria-label="Usuń"
              >
                <X size={12} />
              </button>
            </li>
          {/each}
        {/if}
      </ul>
    </div>
  {/if}
</div>
