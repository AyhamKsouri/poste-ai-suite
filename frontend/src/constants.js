// Shared label/style maps for complaint fields, used by both Complaints.jsx
// (list) and ComplaintDetail.jsx (detail). QA audit finding L5: these used
// to be defined only in Complaints.jsx (and only urgency/status, never
// category), so the detail page showed raw enum values for everything and
// the list page showed a raw value for category specifically.
export const STATUS_LABEL = { new: "Nouveau", reviewed: "Analysé", replied: "Répondu" };
export const STATUS_STYLE = {
  new: "text-primary bg-primary-fixed",
  reviewed: "text-outline bg-surface-container-highest",
  replied: "text-on-secondary-container bg-secondary-fixed",
};

export const URGENCY_LABEL = { high: "Élevée", medium: "Moyenne", low: "Faible" };
export const URGENCY_STYLE = {
  high: "bg-error-container text-on-error-container border-error/20",
  medium: "bg-secondary-fixed text-on-secondary-fixed-variant border-secondary/20",
  low: "bg-surface-container-high text-on-surface border-outline-variant",
};
export const URGENCY_DOT = { high: "bg-error", medium: "bg-secondary", low: "bg-primary-container" };

export const CATEGORY_LABEL = {
  delivery_delay: "Retard de livraison",
  lost_package: "Colis perdu",
  billing: "Facturation",
  damaged_item: "Objet endommagé",
  money_order_issue: "Problème de mandat",
  other: "Autre",
};
