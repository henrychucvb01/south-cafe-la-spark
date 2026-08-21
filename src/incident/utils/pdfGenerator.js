import {
  PDFDocument,
  StandardFonts,
} from "pdf-lib";

function formatDate(value) {
  if (!value) return "";

  if (value.includes("/")) {
    return value;
  }

  const parts = value.split("-");

  if (parts.length !== 3) {
    return value;
  }

  const [year, month, day] = parts;

  return `${month}/${day}/${year}`;
}

function safeText(value) {
  return value ? String(value).trim() : "";
}

function setTextField(form, fieldName, value) {
  try {
    const field = form.getTextField(fieldName);
    field.setText(safeText(value));
  } catch (error) {
    console.warn(`Could not fill text field: ${fieldName}`, error);
  }
}

function checkField(form, fieldName) {
  try {
    const field = form.getCheckBox(fieldName);
    field.check();
  } catch (error) {
    console.warn(`Could not check field: ${fieldName}`, error);
  }
}

function downloadPdf(bytes, filename) {
  const blob = new Blob([bytes], {
    type: "application/pdf",
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function buildFilename(data) {
  const employee =
    safeText(data.employeeName)
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .trim()
      .replace(/\s+/g, "_") || "Employee";

  const date =
    data.incidentDate ||
    new Date().toISOString().slice(0, 10);

  return `Incident_Record_${employee}_${date}.pdf`;
}

function fillIncidentType(form, incidentType) {
  const type = safeText(incidentType).toLowerCase();

  if (type === "drug or alcohol use") {
    checkField(form, "Check Box23");
  } else if (type === "theft") {
    checkField(form, "Check Box26");
  } else if (
    type === "rude and discourteous behavior" ||
    type === "rude or discourteous behavior"
  ) {
    checkField(form, "Check Box28");
  } else if (type === "insubordination") {
    checkField(form, "Check Box24");
  } else if (type === "fight") {
    checkField(form, "Check Box27");
  } else if (type === "dereliction of duties") {
    checkField(form, "Check Box29");
  } else {
    checkField(form, "Check Box25");
  }
}

function fillPreviousDocumentation(form, data) {
  const previous = data.priorAction || "Unknown";

  if (previous === "None") {
    checkField(form, "Check Box19");
    return;
  }

  if (previous === "Unknown") {
    checkField(form, "Check Box20");
    return;
  }

  checkField(form, "Check Box18");

  let description = previous;

  if (data.priorActionDates) {
    description += ` - ${data.priorActionDates}`;
  }

  setTextField(
    form,
    "Has the employee previously received any of the following verbal warning conference memo letter of reprimand NOUS",
    description
  );
}

function fillWrittenStatement(form, answer) {
  if (answer === "Yes") {
    checkField(form, "Check Box30");
  }

  if (answer === "No") {
    checkField(form, "Check Box31");
  }
}

export async function generateIncidentPdf(data) {
  try {
    const response = await fetch(
      "/Incident Record-Blank.pdf"
    );

    if (!response.ok) {
      throw new Error(
        "Could not load Incident Record-Blank.pdf from the public folder."
      );
    }

    const templateBytes =
      await response.arrayBuffer();

    const pdfDoc =
      await PDFDocument.load(templateBytes);

    const form = pdfDoc.getForm();

    const font =
      await pdfDoc.embedFont(
        StandardFonts.Helvetica
      );

    setTextField(
      form,
      "Name",
      data.employeeName
    );

    setTextField(
      form,
      "Employee",
      data.employeeNumber
    );

    setTextField(
      form,
      "Classification",
      data.classification
    );

    setTextField(
      form,
      "Date",
      formatDate(data.incidentDate)
    );

    setTextField(
      form,
      "Probationary When did the employee start",
      formatDate(data.employeeStartDate)
    );

    setTextField(
      form,
      "School Name",
      data.schoolName
    );

    setTextField(
      form,
      "Cafeteria Phone",
      data.cafeteriaPhone
    );

    setTextField(
      form,
      "Cafeteria Manager",
      data.managerName
    );

    setTextField(
      form,
      "Area Supervisor",
      data.areaSupervisor
    );

    fillPreviousDocumentation(
      form,
      data
    );

    fillIncidentType(
      form,
      data.incidentType
    );

    setTextField(
      form,
      "Text21",
      data.narrative
    );

    setTextField(
      form,
      "Text22",
      data.assistanceGuidance
    );

    fillWrittenStatement(
      form,
      data.writtenStatement
    );

    form.updateFieldAppearances(
      font
    );

    const pdfBytes =
      await pdfDoc.save();

    downloadPdf(
      pdfBytes,
      buildFilename(data)
    );

    return true;
  } catch (error) {
    console.error(
      "PDF generation error:",
      error
    );

    alert(
      "The Incident Record PDF could not be created. Please send me the error message shown in CodeSandbox."
    );

    return false;
  }
}