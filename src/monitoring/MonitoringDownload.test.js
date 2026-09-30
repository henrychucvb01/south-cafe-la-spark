import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import MonitoringDownload, { monitoringFilename, pdfFilename } from './MonitoringDownload';
import * as service from '../supperMonitoring/service';
jest.mock('../supperMonitoring/service', () => ({ openSupervisorSession: jest.fn(), closeSession: jest.fn(), getMonitoring: jest.fn(), reportBytes: jest.fn() }));
const school = { id: 7, school_name: 'Ambler El' };
const record = { id: 'r', monitoring_type: 'supper', monitoring_slot: 'manager_1', document_version: 1, status: 'accepted', locked: true };
let host, root, writer;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  writer = { write: jest.fn().mockResolvedValue(), close: jest.fn().mockResolvedValue(), abort: jest.fn().mockResolvedValue() };
  window.showSaveFilePicker = jest.fn().mockResolvedValue({ createWritable: jest.fn().mockResolvedValue(writer) });
  service.openSupervisorSession.mockResolvedValue('supervisor'); service.closeSession.mockResolvedValue();
  service.getMonitoring.mockResolvedValue({ ...record, revision: 8 }); service.reportBytes.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
});
afterEach(() => { act(() => root.unmount()); host.remove(); delete window.showSaveFilePicker; jest.restoreAllMocks(); });
function render(item = record) { act(() => root.render(<MonitoringDownload record={item} school={school} supervisorPin="own-pin"/>)); }
async function click(label) { await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === label).click()); }
test('names distinguish sequence and offsite without inventing other type sequences', () => {
  expect(monitoringFilename(record, school)).toBe('Supper 1-Ambler El.pdf');
  expect(monitoringFilename({ ...record, monitoring_slot: 'manager_2', monitoring_site_name: 'EEC' }, school)).toBe('Supper 3-Ambler El-EEC.pdf');
  expect(monitoringFilename({ ...record, monitoring_type: 'lunch' }, school)).toBe('Lunch-Ambler El.pdf');
  expect(pdfFilename('My: report.PDF')).toBe('My- report.pdf');
});
test('save chooser precedes authentication and saves current locked PDF with supervisor access', async () => {
  render(); await click('Download PDF'); expect(host.querySelector('input').value).toBe('Supper 1-Ambler El.pdf');
  await click('Save As…');
  expect(window.showSaveFilePicker.mock.invocationCallOrder[0]).toBeLessThan(service.openSupervisorSession.mock.invocationCallOrder[0]);
  expect(service.openSupervisorSession).toHaveBeenCalledWith(school, 'own-pin');
  expect(service.reportBytes).toHaveBeenCalledWith('supervisor', { ...record, revision: 8 });
  expect(writer.write).toHaveBeenCalledWith(expect.any(Blob)); expect(writer.close).toHaveBeenCalled();
  expect(service.closeSession).toHaveBeenCalledWith('supervisor'); expect(host.textContent).toContain('PDF saved.');
});
test('canceling the chooser does not download or create a session', async () => {
  window.showSaveFilePicker.mockRejectedValueOnce(Object.assign(new Error('Canceled'), { name: 'AbortError' }));
  render(); await click('Download PDF'); await click('Save As…');
  expect(service.openSupervisorSession).not.toHaveBeenCalled(); expect(host.querySelector('[role=alert]')).toBeNull();
});
test.each([null, { ...record, document_version: 0 }])('missing PDF explains the problem without opening a chooser', async item => {
  render(item); await click('Download PDF'); expect(host.querySelector('[role=alert]').textContent).toContain('There is no monitoring PDF');
  expect(window.showSaveFilePicker).not.toHaveBeenCalled();
});
test('a removed PDF or network failure closes the session and displays a retryable error', async () => {
  service.getMonitoring.mockResolvedValueOnce(null); render(); await click('Download PDF'); await click('Save As…');
  expect(host.querySelector('[role=alert]').textContent).toContain('There is no monitoring PDF');
  expect(writer.write).not.toHaveBeenCalled(); expect(service.closeSession).toHaveBeenCalled();
  service.reportBytes.mockRejectedValueOnce(new Error('Connection failed')); await click('Save As…');
  expect(host.querySelector('[role=alert]').textContent).toContain('Connection failed'); expect(service.closeSession).toHaveBeenCalledTimes(2);
});
test('unsupported browsers download one PDF with the edited filename and explain folder settings', async () => {
  delete window.showSaveFilePicker; URL.createObjectURL = jest.fn().mockReturnValue('blob:pdf'); URL.revokeObjectURL = jest.fn();
  let downloaded; jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { downloaded = this.download; });
  render(); await click('Download PDF'); expect(host.textContent).toContain('Ask where to save each file');
  const input = host.querySelector('input'); act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'My school copy');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('Download PDF'); expect(downloaded).toBe('My school copy.pdf'); expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
});
