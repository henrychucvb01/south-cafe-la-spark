import React, { useEffect, useState } from "react";

import LoginPage from "./pages/LoginPage";
import EmployeeSelectPage from "./pages/EmployeeSelectPage";
import ManagerPinPage from "./pages/ManagerPinPage";
import SchoolHub from "./pages/SchoolHub";
import FinishLinePage from "./pages/FinishLinePage";
import SchoolDashboard from "./pages/SchoolDashboard";
import CommandCenter from "./pages/CommandCenter";
import SupervisorPinPage from "./pages/SupervisorPinPage";
import HomeBase from "./pages/HomeBase";
import IncidentRecordHelper from "./pages/IncidentRecordHelper";
import MealAnalyticsPage from "./pages/MealAnalyticsPage";
import DailyBitesPage from "./pages/DailyBitesPage";

function App() {
  const [screen, setScreen] = useState("login");

  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [supervisorSessionPin, setSupervisorSessionPin] = useState("");

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
      event.preventDefault();

      setInstallPrompt(event);
      setCanInstall(true);
    }

    function handleAppInstalled() {
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

      setInstallPrompt(null);
      setCanInstall(false);
      return;
    }

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
    setSupervisorSessionPin("");
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
        onSuccess={(verifiedPin) => {
          setSupervisorSessionPin(verifiedPin);
          setScreen("commandCenter");
        }}
        onBack={() => {
          setSupervisorSessionPin("");
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
          setScreen("managerPin");
        }}
        onBack={() => {
          resetToLogin();
        }}
      />
    );
  }

  // ---------------------------------------------------
  // MANAGER PIN
  // ---------------------------------------------------
  if (screen === "managerPin") {
    return (
      <ManagerPinPage
        location={selectedLocation}
        employee={selectedEmployee}
        onSuccess={() => {
          setScreen("homeBase");
        }}
        onBack={() => {
          setSelectedEmployee(null);
          setScreen("employeeSelect");
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
        onDailyBites={() => {
          setScreen("dailyBites");
        }}
        onExit={() => {
          resetToLogin();
        }}
      />
    );
  }

  // ---------------------------------------------------
  // DAILY BITES
  // ---------------------------------------------------
  if (screen === "dailyBites") {
    return (
      <DailyBitesPage
        location={selectedLocation}
        employee={selectedEmployee}
        onBack={() => {
          setScreen("homeBase");
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
          if (editingCheck?.previewMode) {
            setEditingCheck(null);
            setScreen("commandCenter");
            return;
          }

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
        supervisorPin={supervisorSessionPin}
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
