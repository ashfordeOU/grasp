import React, { useState } from 'react';
import { Form, ActionPanel, Action, showToast, Toast } from '@raycast/api';

interface FormValues {
  repo: string;
}

export async function analyzeRepo(repo: string): Promise<void> {
  if (!repo || !repo.includes('/')) {
    await showToast({
      style: Toast.Style.Failure,
      title: 'Invalid repository',
      message: 'Format: owner/repo',
    });
    return;
  }
  await showToast({ style: Toast.Style.Animated, title: 'Analysing...', message: repo });
  // Open the Grasp browser app with the repo pre-filled
  const url = `https://ashfordeOU.github.io/grasp?repo=${encodeURIComponent(repo)}`;
  await showToast({ style: Toast.Style.Success, title: 'Opening Grasp', message: url });
}

export default function Command() {
  const [repo, setRepo] = useState('');

  async function handleSubmit(values: FormValues) {
    await analyzeRepo(values.repo);
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Analyze" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="repo"
        title="Repository"
        placeholder="owner/repo (e.g. ashfordeOU/grasp)"
        value={repo}
        onChange={setRepo}
      />
    </Form>
  );
}
