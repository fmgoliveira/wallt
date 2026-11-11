export const onboarding = {
  title: "Welcome to Wallt",
  subtitle: "Two quick steps and your dashboard comes to life.",
  skip: "Skip for now",
  skipLabel: "Hide the getting started guide",
  done: "Done",
  stepCount: "Step {{n}} of {{total}}",
  account: {
    title: "Create an account",
    description: "A bank account, card or cash wallet. You can add more any time.",
    action: "Create account",
  },
  transactions: {
    title: "Bring in your transactions",
    description: "Import a statement from your bank, or add a first transaction by hand.",
    import: "Import a file",
    add: "Add manually",
    needAccount: "Create an account first.",
  },
  optional: {
    title: "Optional: set a budget",
    description: "Set a spending limit and follow your progress on the dashboard.",
    action: "Set a budget",
  },
} as const;
