import type { CardIdentity } from "@/lib/recognized";
import { UNKNOWN_FIELD } from "@/lib/recognized";

function IdentityRow({ label, value }: { label: string; value: string }) {
  const unknown = value === UNKNOWN_FIELD;
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-ink-line/80 py-2.5 first:border-t-0 first:pt-0">
      <dt className="shrink-0 text-sm text-paper-mute">{label}</dt>
      <dd className={`text-right text-base leading-snug ${unknown ? "font-medium text-paper-mute" : "font-semibold"}`}>
        {value}
      </dd>
    </div>
  );
}

export function CardIdentityPanel({
  identity,
  image,
  note,
}: {
  identity: CardIdentity;
  image?: string;
  note?: string;
}) {
  return (
    <section className="mt-4 overflow-hidden rounded-3xl bg-ink-card ring-1 ring-ink-line">
      <div className="flex gap-3 p-4">
        {image ? (
          // Official TCG images only.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-24 w-[4.4rem] shrink-0 rounded-lg object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-paper-mute">Recognized card</p>
          <dl className="mt-2">
            <IdentityRow label="Name" value={identity.name} />
            <IdentityRow label="Number" value={identity.number} />
            <IdentityRow label="Set" value={identity.setName} />
            <IdentityRow label="Year" value={identity.year} />
            <IdentityRow label="Rarity" value={identity.rarity} />
          </dl>
        </div>
      </div>
      {note ? <p className="border-t border-ink-line px-4 py-3 text-sm text-paper-mute">{note}</p> : null}
    </section>
  );
}
