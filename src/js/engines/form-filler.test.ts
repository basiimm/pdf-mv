import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { inspectFormFields, fillForm } from './form-filler.js';

async function makeFormFile(): Promise<File> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 300]);
  const form = pdf.getForm();

  const name = form.createTextField('applicant.fullName');
  name.setText('');
  name.addToPage(page, { x: 10, y: 250, width: 200, height: 20 });

  const notes = form.createTextField('notes');
  notes.enableMultiline();
  notes.addToPage(page, { x: 10, y: 200, width: 200, height: 40 });

  const agree = form.createCheckBox('agreeToTerms');
  agree.addToPage(page, { x: 10, y: 170, width: 15, height: 15 });

  const color = form.createRadioGroup('favoriteColor');
  color.addOptionToPage('Red', page, { x: 10, y: 140, width: 15, height: 15 });
  color.addOptionToPage('Blue', page, { x: 40, y: 140, width: 15, height: 15 });
  color.select('Red');

  const country = form.createDropdown('country');
  country.addOptions(['USA', 'Canada', 'Mexico']);
  country.addToPage(page, { x: 10, y: 100, width: 100, height: 20 });

  const readOnlyField = form.createTextField('locked');
  readOnlyField.setText('do not touch');
  readOnlyField.addToPage(page, { x: 10, y: 60, width: 100, height: 20 });
  readOnlyField.enableReadOnly();

  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'form.pdf', {
    type: 'application/pdf',
  });
}

async function makeNoFormFile(): Promise<File> {
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 100]);
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], 'plain.pdf', {
    type: 'application/pdf',
  });
}

const ctx = { signal: new AbortController().signal, progress: () => {} };

describe('inspectFormFields', () => {
  it('discovers text, multiline, checkbox, radio and dropdown fields with human labels', async () => {
    const file = await makeFormFile();
    const { fields, values, details } = await inspectFormFields(file);

    const byLabel = new Map(fields.map((f) => [f.label, f]));
    expect(byLabel.has('Applicant full name')).toBe(true);
    expect(byLabel.get('Applicant full name')!.type).toBe('text');
    expect(byLabel.get('Notes')!.type).toBe('textarea');
    expect(byLabel.get('Agree to terms')!.type).toBe('checkbox');
    expect(byLabel.get('Favorite color')!.type).toBe('segmented');
    expect(byLabel.get('Country')!.type).toBe('select');

    expect(byLabel.get('Favorite color')!.options).toEqual([
      ['Red', 'Red'],
      ['Blue', 'Blue'],
    ]);

    const colorKey = byLabel.get('Favorite color')!.key;
    expect(values[colorKey]).toBe('Red');

    expect(details).toEqual([['Form fields', '5 fields']]);
  });

  it('excludes read-only fields', async () => {
    const file = await makeFormFile();
    const { fields } = await inspectFormFields(file);
    expect(fields.some((f) => f.label === 'Locked')).toBe(false);
  });

  it('reports when there are no form fields', async () => {
    const file = await makeNoFormFile();
    const result = await inspectFormFields(file);
    expect(result.fields).toEqual([]);
    expect(result.details).toEqual([['Form fields', 'None found']]);
  });
});

describe('fillForm', () => {
  it('fills text, checkbox, radio and dropdown fields by key', async () => {
    const file = await makeFormFile();
    const { fields } = await inspectFormFields(file);
    const key = (label: string) => fields.find((f) => f.label === label)!.key;

    const result = await fillForm(
      file,
      {
        [key('Applicant full name')]: 'Ada Lovelace',
        [key('Agree to terms')]: 'true',
        [key('Favorite color')]: 'Blue',
        [key('Country')]: 'Canada',
      },
      ctx
    );

    const doc = await PDFDocument.load(await result.arrayBuffer());
    const form = doc.getForm();
    expect(form.getTextField('applicant.fullName').getText()).toBe(
      'Ada Lovelace'
    );
    expect(form.getCheckBox('agreeToTerms').isChecked()).toBe(true);
    expect(form.getRadioGroup('favoriteColor').getSelected()).toBe('Blue');
    expect(form.getDropdown('country').getSelected()).toEqual(['Canada']);
  });

  it('flattens the form when requested', async () => {
    const file = await makeFormFile();
    const { fields } = await inspectFormFields(file);
    const key = (label: string) => fields.find((f) => f.label === label)!.key;

    const result = await fillForm(
      file,
      { [key('Applicant full name')]: 'Ada', flatten: 'true' },
      ctx
    );

    const doc = await PDFDocument.load(await result.arrayBuffer());
    expect(doc.getForm().getFields().length).toBe(0);
  });

  it('rejects when cancelled', async () => {
    const file = await makeFormFile();
    const controller = new AbortController();
    controller.abort();
    await expect(
      fillForm(file, {}, { signal: controller.signal, progress: () => {} })
    ).rejects.toThrow('Cancelled');
  });
});
