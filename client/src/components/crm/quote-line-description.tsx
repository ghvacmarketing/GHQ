/** Quote line descriptions can be multi-line: the first line is the item
 *  title, any following lines are component detail (e.g. "Coil: …",
 *  "Thermostat: …") added by the proposal builder. Render the title in the
 *  surface's own style and the detail lines smaller and muted. */
export function QuoteLineDescription({ text, titleClassName, detailClassName }: {
  text: string | null | undefined;
  titleClassName?: string;
  detailClassName?: string;
}) {
  const [first, ...rest] = String(text || "").split("\n");
  return (
    <>
      <div className={titleClassName}>{first}</div>
      {rest.length > 0 && (
        <div className={detailClassName || "mt-0.5 whitespace-pre-line text-xs leading-snug text-slate-500"}>
          {rest.join("\n")}
        </div>
      )}
    </>
  );
}
