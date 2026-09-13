import type { Metadata } from "next";
import { staffPage } from "@/lib/auth";
import { getSettings, scoreWeights } from "@/lib/settings";
import { PageBody, PageHeader } from "../page-header";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await staffPage(["ADMIN"]);
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Settings" description="Everything guests see and how the floor runs. Changes apply immediately after you save." />
      <PageBody>
        <SettingsForm
          orderingEnabled={s.orderingEnabled}
          initial={{
            restaurantName: s.restaurantName,
            tagline: s.tagline,
            phone: s.phone,
            address: s.address,
            instagram: s.instagram,
            vatPercent: s.vatBps / 100,
            serviceChargePercent: s.serviceChargeBps / 100,
            claimTimeoutSec: s.claimTimeoutSec,
            requestEscalateSec: s.requestEscalateSec,
            readyAlertSec: s.readyAlertSec,
            openingTime: s.openingTime,
            closingTime: s.closingTime,
            bankName: s.bankName,
            bankAccountName: s.bankAccountName,
            bankAccountNumber: s.bankAccountNumber,
            scoreWeights: scoreWeights(s.scoreWeights),
            minHoursForAward: s.minHoursForAward,
            minOrdersForAward: s.minOrdersForAward,
          }}
        />
      </PageBody>
    </>
  );
}
