import type { BadgeTenure } from "../contestStore";

type Props = { badges: BadgeTenure[]; emptyMessage?: string };

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

export function BadgeHistory({ badges, emptyMessage = "No badges earned yet." }: Props) {
  if (!badges.length) return <p className="empty-state">{emptyMessage}</p>;
  return (
    <ul className="badge-history">
      {badges.map((badge) => (
        <li key={`${badge.key}-${badge.startDate}`}>
          <span aria-hidden="true">★</span>
          <div>
            <b>{badge.label}</b>
            <small>{dateLabel(badge.startDate)}{badge.endDate ? ` – ${dateLabel(badge.endDate)}` : " – Current"}</small>
          </div>
        </li>
      ))}
    </ul>
  );
}
