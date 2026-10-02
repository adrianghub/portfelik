<script lang="ts">
  import {
    Tag,
    ShoppingBasket,
    House,
    Car,
    Heart,
    Utensils,
    Briefcase,
    Wallet,
    Target,
    Landmark,
    Plane,
    GraduationCap,
  } from "lucide-svelte";
  let { name = "tag", size = 18 }: { name?: string | null; size?: number } = $props();
  const icons = {
    tag: Tag,
    "shopping-basket": ShoppingBasket,
    home: House,
    car: Car,
    heart: Heart,
    utensils: Utensils,
    briefcase: Briefcase,
    wallet: Wallet,
    target: Target,
    landmark: Landmark,
    plane: Plane,
    "graduation-cap": GraduationCap,
  };
  const Icon = $derived(icons[(name ?? "tag") as keyof typeof icons] ?? Tag);
</script>

<Icon {size} strokeWidth={1.7} aria-hidden="true" />
