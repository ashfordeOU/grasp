// Mock for @raycast/api — used in tests only
import React from 'react';

export const Form = ({ children }: { children: React.ReactNode }) => null;
export const ActionPanel = ({ children }: { children: React.ReactNode }) => null;
export const Detail = ({ markdown }: { markdown: string }) => null;
export const Action = {
  SubmitForm: (_props: unknown) => null,
  OpenInBrowser: (_props: unknown) => null,
};

const mockToast = { style: '', title: '', message: '' };
export const showToast = jest.fn().mockResolvedValue(mockToast);
export const Toast = { Style: { Animated: 'animated', Success: 'success', Failure: 'failure' } };
export const useNavigation = () => ({ push: jest.fn(), pop: jest.fn() });
export const environment = { supportPath: '/tmp' };
