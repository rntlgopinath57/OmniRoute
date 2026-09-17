const ROUTES = Object.freeze({
  coding: Object.freeze({
    primaryProvider: "anthropic",
    fallbackProvider: "openai",
    modelProfile: "coding-strong",
  }),
  research: Object.freeze({
    primaryProvider: "openai",
    fallbackProvider: "google",
    modelProfile: "research-strong",
  }),
  automation: Object.freeze({
    primaryProvider: "openai",
    fallbackProvider: "anthropic",
    modelProfile: "automation-efficient",
  }),
  design: Object.freeze({
    primaryProvider: "google",
    fallbackProvider: "openai",
    modelProfile: "design-multimodal",
  }),
  general: Object.freeze({
    primaryProvider: "openai",
    fallbackProvider: "google",
    modelProfile: "general-balanced",
  }),
});

export function selectModelRoute(taskType) {
  const normalizedType = typeof taskType === "string" ? taskType.trim().toLowerCase() : "general";
  const route = ROUTES[normalizedType] ?? ROUTES.general;

  return {
    primaryProvider: route.primaryProvider,
    fallbackProvider: route.fallbackProvider,
    modelProfile: route.modelProfile,
  };
}
