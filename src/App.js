import React, { useEffect, useState } from "react";

import LoginPage from "./pages/LoginPage";
import EmployeeSelectPage from "./pages/EmployeeSelectPage";
import SchoolHub from "./pages/SchoolHub";
import FinishLinePage from "./pages/FinishLinePage";
import SchoolDashboard from "./pages/SchoolDashboard";
import CommandCenter from "./pages/CommandCenter";
import SupervisorPinPage from "./pages/SupervisorPinPage";
import HomeBase from "./pages/HomeBase";
import IncidentRecordHelper from "./pages/IncidentRecordHelper";
import MealAnalyticsPage from "./pages/MealAnalyticsPage";

function App() {
  const [screen, setScreen] = useState("login");

  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Holds today's existing Finish Line when the manager is editing it.
  // null = creating a new Finish Line.
  const [editingCheck, setEditingCheck] = useState(null);

  // ---------------------------------------------------
  // INSTALL SOUTH CAFÉ LA
  // ---------------------------------------------------
  const [installPrompt, setInstallPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      // Stop the browser from immediately showing
      // its own installation prompt.
      event.preventDefault();

      // Save the install event so our own button can use it.
      setInstallPrompt(event);
      setCanInstall(true);
    }

    function handleAppInstalled() {
      // The app has been installed.
      setInstallPrompt(null);
      setCanInstall(false);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );

      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function handleInstallApp() {
    // Chrome/Edge gave us the native install prompt.
    if (installPrompt) {
      installPrompt.prompt();

      try {
        const choice = await installPrompt.userChoice;

        if (choice.outcome === "accepted") {
          console.log("SPARK installation accepted.");
        } else {
          console.log("SPARK installation dismissed.");
        }
      } catch (error) {
        console.error("Install prompt error:", error);
      }

      // The browser install prompt can only be used once.
      setInstallPrompt(null);
      setCanInstall(false);
      return;
    }

    // Fallback when the browser does not expose
    // beforeinstallprompt to the page.
    alert(
      "To install SPARK on this computer, click the Install icon in the browser address bar, then select Install."
    );
  }

  // ---------------------------------------------------
  // RESET
  // ---------------------------------------------------
  function resetToLogin() {
    setSelectedLocation(null);
    setSelectedEmployee(null);
    setEditingCheck(null);
    setScreen("login");
  }

  // ---------------------------------------------------
  // LOGIN
  // ---------------------------------------------------
  if (screen === "login") {
    return (
      <LoginPage
        canInstall={canInstall}
        onInstall={handleInstallApp}
        onLocationSelected={(location) => {
          setSelectedLocation(location);
          setSelectedEmployee(null);
          setEditingCheck(null);
          setScreen("employeeSelect");
        }}
        onSupervisor={() => {
          setEditingCheck(null);
          setScreen("supervisorPin");
        }}
      />
    );
  }

  // ---------------------------------------------------
  // SUPERVISOR PIN
  // ---------------------------------------------------
  if (screen === "supervisorPin") {
    return (
      <SupervisorPinPage
        onSuccess={() => {
          setScreen("commandCenter");
        }}
        onBack={() => {
          setScreen("login");
        }}
      />
    );
  }

  // ---------------------------------------------------
  // EMPLOYEE SELECTION
  // ---------------------------------------------------
  if (screen === "employeeSelect") {
    return (
      <EmployeeSelectPage
        location={selectedLocation}
        onEmployeeSelected={(employee) => {
          setSelectedEmployee(employee);
          setEditingCheck(null);
          setScreen("homeBase");
        }}
        onBack={() => {
          resetToLogin();
        }}
      />
    );
  }

  // ---------------------------------------------------
  // SPARK HOME BASE
  // ---------------------------------------------------
  if (screen === "homeBase") {
    return (
      <HomeBase
        location={selectedLocation}
        employee={selectedEmployee}
        onSchoolHub={() => {
          setScreen("schoolHub");
        }}
        onIncidentHelper={() => {
          setScreen("incidentHelper");
        }}
        onExit={() => {
          resetToLogin();
        }}
      />
    );
  }

  // ---------------------------------------------------
  // INCIDENT RECORD HELPER
  // ---------------------------------------------------
  if (screen === "incidentHelper") {
    return (
      <IncidentRecordHelper
        location={selectedLocation}
        employee={selectedEmployee}
        onBack={() => {
          setScreen("homeBase");
        }}
      />
    );
  }

  // ---------------------------------------------------
  // SCHOOL HUB
  // ---------------------------------------------------
  if (screen === "schoolHub") {
    return (
      <SchoolHub
        location={selectedLocation}
        employee={selectedEmployee}
        onFinishLine={() => {
          setEditingCheck(null);
          setScreen("finishLine");
        }}
        onDashboard={() => {
          setScreen("schoolDashboard");
        }}
        onMealAnalytics={() => {
          setScreen("mealAnalytics");
        }}
        onExit={() => {
          setScreen("homeBase");
        }}
      />
    );
  }
  // ---------------------------------------------------
  // MEAL ANALYTICS
  // ---------------------------------------------------
  if (screen === "mealAnalytics") {
    return (
      <MealAnalyticsPage
        location={selectedLocation}
        employee={selectedEmployee}
        onBack={() => {
          setScreen("schoolHub");
        }}
      />
    );
  }
  // ---------------------------------------------------
  // FINISH LINE
  // ---------------------------------------------------
  if (screen === "finishLine") {
    return (
      <FinishLinePage
        location={selectedLocation}
        employee={selectedEmployee}
        existingCheck={editingCheck}
        onBack={() => {
          // If this is a supervisor preview,
          // go back to the Command Center.
          if (editingCheck?.previewMode) {
            setEditingCheck(null);
            setScreen("commandCenter");
            return;
          }

          // Normal manager flow:
          // go back to the School Dashboard.
          setEditingCheck(null);
          setScreen("schoolDashboard");
        }}
        onComplete={() => {
          setEditingCheck(null);
          setScreen("schoolDashboard");
        }}
      />
    );
  }

  // ---------------------------------------------------
  // SCHOOL DASHBOARD
  // ---------------------------------------------------
  if (screen === "schoolDashboard") {
    return (
      <SchoolDashboard
        location={selectedLocation}
        employee={selectedEmployee}
        onBack={() => {
          setEditingCheck(null);
          setScreen("schoolHub");
        }}
        onEditFinishLine={(check) => {
          setEditingCheck(check);
          setScreen("finishLine");
        }}
      />
    );
  }

  // ---------------------------------------------------
  // SUPERVISOR COMMAND CENTER
  // ---------------------------------------------------
  if (screen === "commandCenter") {
    return (
      <CommandCenter
        onExit={() => {
          resetToLogin();
        }}
        onOpenSchoolAnalytics={(school) => {
          setSelectedLocation(school);
          setScreen("mealAnalytics");
        }}
        onPreviewFinishLine={(preview) => {
          setEditingCheck({
            previewMode: true,
            previewDay: preview.day,
            previewMonthEnd: preview.monthEnd,
          });

          setScreen("finishLine");
        }}
      />
    );
  }

  return null;
}

export default App;
