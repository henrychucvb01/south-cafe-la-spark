/*
  SOUTH CAFÉ LA
  Handbook Reference Assistant

  PURPOSE:
  This module will eventually allow managers to ask questions
  about Food Services policies and receive answers based on
  the Food Services Division Employee Handbook.

  FUTURE FEATURES:
  - Ask handbook questions in plain English
  - Search relevant handbook sections
  - Provide handbook-based answers
  - Show the section/page used for the answer
  - Avoid inventing policies not found in the handbook
  - Link Handbook Reference to Incident Helper
*/

export const HANDBOOK_REFERENCE_VERSION = "0.1";

export const handbookReferenceConfig = {
  enabled: false,
  title: "Handbook Reference",
  description:
    "Ask a question about Food Services policies and procedures.",
};