import { expect, test, type Browser, type Page } from "@playwright/test";
import pg from "pg";

async function db<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

async function device(browser: Browser, kind: "phone" | "tablet") {
  const ctx = await browser.newContext(kind === "phone" ? { viewport: { width: 390, height: 844 }, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  return page;
}

async function staffLogin(page: Page, code: string, pin: string) {
  await page.goto("/staff/login");
  await page.getByPlaceholder("Staff code (e.g. W001)").fill(code);
  for (const d of pin) await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("button", { name: "Clock in" }).click();
}

test("a table's whole visit, live across guest, waiter, kitchen and bar screens", async ({ browser }) => {
  const guest = await device(browser, "phone");
  const waiter = await device(browser, "phone");
  const kitchen = await device(browser, "tablet");
  const bar = await device(browser, "tablet");

  await staffLogin(waiter, "W001", "1111");
  await expect(waiter.getByText("No orders waiting")).toBeVisible();
  await staffLogin(kitchen, "K001", "5555");
  await expect(kitchen.getByText("No tickets")).toBeVisible();
  await staffLogin(bar, "B001", "6666");
  await expect(bar.getByText("No tickets")).toBeVisible();

  // Guest scans the T5 card and orders.
  const [{ qrToken }] = await db<{ qrToken: string }>(`SELECT "qrToken" FROM "Table" WHERE label = 'T5'`);
  await guest.goto(`/t/${qrToken}`);
  await expect(guest.getByRole("heading", { level: 1 })).toContainText("welcome to Istanbul");
  await expect(guest.getByText("T5", { exact: true })).toBeVisible();
  // The only thing to ask for from the phone is the waiter, and only once the table has ordered.
  await expect(guest.getByRole("button", { name: /Call waiter/ })).toBeDisabled();
  await expect(guest.getByRole("button", { name: "Water", exact: true })).toHaveCount(0);
  // The menu opens on its sections; a section shows just its dishes.
  await guest.getByRole("button", { name: /^Kebabs/ }).click();
  await guest.getByRole("button", { name: "Add Adana Kebab" }).click();
  await guest.getByRole("button", { name: "All sections" }).click();
  await guest.getByRole("button", { name: /^Mocktails/ }).click();
  await guest.getByRole("button", { name: "Add Chapman" }).click();
  await guest.getByRole("button", { name: "All sections" }).click();
  // Search looks across the whole menu. A dish with a required choice opens its sheet instead of adding straight away.
  await guest.getByLabel("Search the menu").fill("tandoori soup");
  await guest.getByRole("button", { name: "Add Traditional Lamb Tandoori Soup" }).click();
  await expect(guest.getByRole("button", { name: "Choose spice", exact: true })).toBeDisabled();
  await guest.getByRole("button", { name: "Mild", exact: true }).click();
  await guest.getByRole("button", { name: /Add · ₦18,000/ }).click();
  await guest.getByRole("button", { name: /Review your order/ }).click();
  await guest.getByRole("button", { name: /Send to waiter/ }).click();
  await expect(guest.getByText("Waiting for your waiter")).toBeVisible();
  await expect(guest.getByRole("button", { name: /Call waiter/ })).toBeEnabled();
  // ₦30,000 + ₦13,000 + ₦18,000 = ₦61,000. Istanbul's menu prices are final: nothing is added on top.
  await expect(guest.getByText("To pay your waiter")).toBeVisible();
  await expect(guest.getByText("₦61,000").first()).toBeVisible();
  await expect(guest.getByText(/VAT|service charge/)).toHaveCount(0);

  // Waiter's phone rings with the new table; they accept it and go to take payment.
  await expect(waiter.getByText("NEW TABLE")).toBeVisible();
  await expect(waiter.getByText("₦61,000").first()).toBeVisible();
  await waiter.getByRole("button", { name: "Accept" }).click();
  await expect(guest.getByText("Accepted by Aisha")).toBeVisible();
  await expect(guest.getByText("Aisha is coming to take payment")).toBeVisible();
  // Not paid yet, so the kitchen hasn't got it.
  await expect(kitchen.getByText("No tickets")).toBeVisible();

  await waiter.getByRole("button", { name: "My tables" }).click();
  await waiter.getByRole("button", { name: "Take payment" }).click();
  await expect(waiter.getByText("ready in about 25 min")).toBeVisible();
  await waiter.getByRole("button", { name: /Paid ₦61,000 · send to kitchen/ }).click();
  await expect(guest.getByText("Paid — sent to the kitchen")).toBeVisible();
  await expect(guest.getByText(/Ready around \d\d:\d\d/)).toBeVisible();

  // Each station only sees its own items.
  await expect(kitchen.getByText("Adana Kebab")).toBeVisible();
  await expect(kitchen.getByText("Mild")).toBeVisible(); // the guest's choice is on the ticket
  await expect(kitchen.getByText("Chapman")).toHaveCount(0);
  await kitchen.getByRole("button", { name: "Start" }).click();
  await kitchen.getByRole("button", { name: /Ready/ }).click();
  await expect(bar.getByText("Chapman")).toBeVisible();
  await bar.getByRole("button", { name: "Ready", exact: true }).click();

  // Waiter delivers; the guest's phone follows along.
  await expect(waiter.getByText("READY", { exact: true })).toHaveCount(3);
  await waiter.getByRole("button", { name: /Served — mark delivered/ }).click();
  await expect.poll(async () => (await db<{ status: string }>(`SELECT status FROM "Order"`))[0]?.status).toBe("SERVED");
  await guest.getByRole("button", { name: /Your orders/ }).click();
  await expect(guest.getByText("Served — enjoy")).toBeVisible();

  // Everything is paid and served, so the guest is asked how it was.
  await guest.getByRole("button", { name: /Enjoying your meal/ }).click();
  await expect(guest.getByText("How was everything?")).toBeVisible();
  await guest.getByRole("button", { name: "5 stars" }).nth(0).click();
  await guest.getByRole("button", { name: "4 stars" }).nth(1).click();
  await guest.getByRole("button", { name: "Send", exact: true }).click();
  await expect(guest.getByText("Thank you!")).toBeVisible();

  await waiter.getByRole("button", { name: "Clear" }).click();
  await expect(guest.getByText("Thank you for dining with us")).toBeVisible();

  // Everything landed in the audit log, attributed to the right people.
  const events = await db<{ action: string; name: string | null }>(
    `SELECT e.action, s.name FROM "ActivityEvent" e LEFT JOIN "Staff" s ON s.id = e."staffId"
     WHERE e."tableId" = (SELECT id FROM "Table" WHERE label = 'T5') ORDER BY e.at`,
  );
  const who = (action: string) => events.find((e) => e.action === action)?.name;
  expect(events.map((e) => e.action)).toEqual(
    expect.arrayContaining(["SESSION_OPENED", "ORDER_PLACED", "ORDER_CLAIMED", "PAYMENT_RECORDED", "ORDER_SENT_TO_KITCHEN", "ITEMS_READY", "ORDER_SERVED", "RATING_SUBMITTED", "SESSION_CLOSED"]),
  );
  expect(who("ORDER_CLAIMED")).toBe("Aisha Musa");
  expect(who("ITEMS_STARTED")).toBe("Ibrahim Lawal");
  expect(who("PAYMENT_RECORDED")).toBe("Aisha Musa");
  const [payment] = await db<{ amountKobo: number; method: string; linked: boolean }>(`SELECT "amountKobo", method, "orderId" IS NOT NULL AS linked FROM "Payment"`);
  expect(payment).toEqual({ amountKobo: 6_100_000, method: "CASH", linked: true });
  const [rating] = await db<{ serviceRating: number }>(`SELECT "serviceRating" FROM "Rating"`);
  expect(rating.serviceRating).toBe(4);
});
