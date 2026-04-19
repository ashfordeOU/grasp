// Mock for @raycast/api — used in tests only
export const Form = ({ children }: { children: React.ReactNode }) => null;
export const ActionPanel = ({ children }: { children: React.ReactNode }) => null;
export const Action = {
  SubmitForm: ({ onSubmit }: { onSubmit: (values: Record<string, string>) => void }) => null,
};
export const showToast = jest.fn().mockResolvedValue(undefined);
export const Toast = { Style: { Animated: 'animated', Success: 'success', Failure: 'failure' } };
export const useNavigation = () => ({ push: jest.fn(), pop: jest.fn() });
