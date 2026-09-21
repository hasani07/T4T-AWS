import { RainCategory } from "@/lib/rainfallClass";

export default function RainCategoryBadge({ category }: { category: RainCategory }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${category.badgeClass}`}
    >
      {category.label}
    </span>
  );
}
