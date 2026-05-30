'use strict';

const DEFAULT_SHIFT_CHECKLIST = [
  { id: 'c1', labelKey: 'checkFilamentLevels', label: 'Check filament levels on all printers' },
  { id: 'c2', labelKey: 'verifyTemperatures', label: 'Verify printer temperatures are correct' },
  { id: 'c3', labelKey: 'reviewOrderQueue', label: "Review today's order queue" },
  { id: 'c4', labelKey: 'checkFailedPrints', label: 'Check for any failed prints from previous shift' },
  { id: 'c5', labelKey: 'cleanPrintSurfaces', label: 'Clean print surfaces' },
  { id: 'c6', labelKey: 'logShiftStartTime', label: 'Log shift start time' },
];

/** Return configured shift checklist items or defaults. */
function getShiftChecklistItems(settings) {
  const list = settings?.shiftChecklistItems;
  if (Array.isArray(list) && list.length > 0) {
    return list.filter(item => item && item.id && item.label);
  }
  return DEFAULT_SHIFT_CHECKLIST.map(item => ({ ...item }));
}

/** Count checked items; returns { checked, total, allComplete }. */
function summarizeShiftChecks(checkItems, checkedIds) {
  const ids = new Set(checkedIds || []);
  const total = checkItems.length;
  const checked = checkItems.filter(c => ids.has(c.id)).length;
  return { checked, total, allComplete: total > 0 && checked === total };
}

/** Whether shift start is allowed given require-all setting. */
function canStartShift(checkItems, checkedIds, requireAll) {
  const { allComplete } = summarizeShiftChecks(checkItems, checkedIds);
  if (!requireAll) return true;
  return allComplete;
}

module.exports = {
  DEFAULT_SHIFT_CHECKLIST,
  getShiftChecklistItems,
  summarizeShiftChecks,
  canStartShift,
};
