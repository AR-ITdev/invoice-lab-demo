import { Archive, ArrowLeftRight, Banknote, Building2, CreditCard, ShieldCheck, Truck } from "lucide-react";

export const SUPPLIER_ICONS = { atm: Banknote, cash: Truck, pos: CreditCard, archive: Archive, clearing: ArrowLeftRight, security: ShieldCheck };

export function SupplierIcon({ supplier, ...props }) {
  const Icon = SUPPLIER_ICONS[supplier?.icon] ?? Building2;
  return <Icon aria-hidden="true" {...props} />;
}
