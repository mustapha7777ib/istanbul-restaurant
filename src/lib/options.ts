// Menu choices: "Served with a side dish of choice", wing flavour, chicken or prawns…
// Each group is a single choice. Price deltas are in kobo and added to the item price.

export type MenuOption = { name: string; priceKobo: number };
export type OptionGroup = { name: string; required: boolean; options: MenuOption[] };
export type Choice = { group: string; option: string };
export type ChosenOption = { group: string; name: string; priceKobo: number };

/** Tolerant read of the JSON column (bad data never breaks the menu). */
export function parseOptionGroups(raw: unknown): OptionGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g) => {
      const group = g as Partial<OptionGroup>;
      const options = Array.isArray(group.options)
        ? group.options
            .map((o) => ({ name: String(o?.name ?? "").trim(), priceKobo: Math.max(0, Math.round(Number(o?.priceKobo) || 0)) }))
            .filter((o) => o.name)
        : [];
      return { name: String(group.name ?? "").trim(), required: Boolean(group.required), options };
    })
    .filter((g) => g.name && g.options.length);
}

export class ChoiceError extends Error {}

/** Validate a guest's choices against the item's groups and price them. */
export function resolveChoices(itemName: string, groups: OptionGroup[], choices: Choice[]) {
  const picked: ChosenOption[] = [];
  for (const g of groups) {
    const c = choices.find((x) => x.group === g.name);
    if (!c) {
      if (g.required) throw new ChoiceError(`Choose a ${g.name.toLowerCase()} for ${itemName}`);
      continue;
    }
    const opt = g.options.find((o) => o.name === c.option);
    if (!opt) throw new ChoiceError(`“${c.option}” isn't available for ${itemName} any more. Please choose again.`);
    picked.push({ group: g.name, name: opt.name, priceKobo: opt.priceKobo });
  }
  return { options: picked, extraKobo: picked.reduce((s, o) => s + o.priceKobo, 0) };
}

export function parseChosen(raw: unknown): ChosenOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((o) => o && typeof o === "object" && "name" in o).map((o) => ({ group: String(o.group ?? ""), name: String(o.name), priceKobo: Number(o.priceKobo) || 0 }));
}

/** "Jollof rice · Spicy" for tickets, bills and cart lines. */
export function choicesLabel(opts: { name: string }[] | null | undefined) {
  return (opts ?? []).map((o) => o.name).join(" · ");
}
