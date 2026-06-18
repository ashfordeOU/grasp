import { Parser } from '../src/parser';

// Regression: the VBA-specific security checks (Shell(), SendKeys, WScript.Shell,
// Application.Run, "On Error Resume Next") must only run on VBA files. They used to
// run on every file, so the English word "shell (" in prose — e.g. an orbital
// "Walker shell (6 planes...)" comment in a TOML — falsely matched /Shell\s*\(/i
// and produced a HIGH-severity "Shell Command Execution" finding on static config.
describe('Parser.detectSecurity — VBA checks gated to VBA files', () => {
  it('does NOT flag "Shell Command Execution" for the word "shell (" in non-VBA prose', () => {
    const files = [{
      name: 'jamming-demo.toml',
      path: 'scenarios/jamming-demo.toml',
      content: '# A GPS-like 24-satellite Walker shell (6 planes x 4), propagated\nkind = "jamming"\n',
    }];
    const issues = Parser.detectSecurity(files);
    expect(issues.some((i: any) => i.title === 'Shell Command Execution')).toBe(false);
  });

  it('still flags a real VBA Shell() call in a .bas file', () => {
    const files = [{
      name: 'Module1.bas',
      path: 'Module1.bas',
      content: 'Attribute VB_Name = "Module1"\nSub Run()\n  Shell("cmd.exe /c dir")\nEnd Sub\n',
    }];
    const issues = Parser.detectSecurity(files);
    expect(issues.some((i: any) => i.title === 'Shell Command Execution')).toBe(true);
  });

  it('does not flag VBA-only constructs (SendKeys / WScript.Shell) in non-VBA files', () => {
    const files = [{
      name: 'notes.md',
      path: 'docs/notes.md',
      content: 'We discussed SendKeys() and CreateObject("WScript.Shell") at the meeting.\n',
    }];
    const issues = Parser.detectSecurity(files);
    expect(issues.some((i: any) =>
      i.title === 'SendKeys Usage' || i.title === 'WScript.Shell Creation')).toBe(false);
  });
});
