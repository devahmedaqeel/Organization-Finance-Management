import React from "react";
import { PayrollEntry } from "@/context/FinanceContext";
import { PayslipViewerModal } from "@/components/payslip/PayslipViewerModal";

interface WebSlipViewModalProps {
  visible: boolean;
  onClose: () => void;
  entry: PayrollEntry | null;
}

/** Kept for backward compatibility; delegates to the template-aware payslip viewer. */
export function WebSlipViewModal({ visible, onClose, entry }: WebSlipViewModalProps) {
  return <PayslipViewerModal visible={visible && Boolean(entry)} entries={entry ? [entry] : []} onClose={onClose} />;
}
