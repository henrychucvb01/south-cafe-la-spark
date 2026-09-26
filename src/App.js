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
import ManagerResourcesPage from "./pages/ManagerResourcesPage";
import AskSparkPage from "./pages/AskSparkPage";
import LocationInformationPage from "./pages/LocationInformationPage";
import OperationsHelpPage from "./pages/OperationsHelpPage";
import HowToEarnPointsPage from "./pages/HowToEarnPointsPage"; // <--- Added
import ManagerFeedback from "./feedback/ManagerFeedback";
import ManagerMonthlyScorecardPage from "./monthlyScorecards/ManagerMonthlyScorecardPage";
import SupervisorMonitoringPage from "./monitoring/SupervisorMonitoringPage";
import MonitoringPage from "./monitoring/MonitoringPage";
import PageNavigationProvider, { usePageNavigation } from "./navigation/PageNavigation";

import MysteryPullPage from "./mysteryPull/MysteryPullPage";
import { mysteryRpc, saveSession } from "./mysteryPull/service";

function App() {
  const [screen, setScreen] = useState(()=>window.location.hash === "#mystery-pull" ? "mysteryPull" : "login");
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [managerSessionPin, setManagerSessionPin] = useState("");
  const [supervisorSessionPin, setSupervisorSessionPin] = useState("");
  const [editingCheck, setEditingCheck] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);
  const supervisorContext = !!supervisorSessionPin;
  const destinations = {
    homeBase: ["Manager Hub"], commandCenter: ["Command Center"],
    monitoring: ["Monitorings", "Manager Hub", "homeBase"],
    supervisorMonitoring: ["Monitorings", "Command Center", "commandCenter"],
    managerMonthlyScorecard: ["Monthly Scorecard", "Manager Hub", "homeBase"],
    managerResources: ["Manager Resources", "Manager Hub", "homeBase"],
    howToEarnPoints: ["How to Earn Points", "Manager Resources", "managerResources"],
    operationsHelp: ["Operations Help", "Manager Resources", "managerResources"],
    askSpark: ["Ask SPARK", "Manager Resources", "managerResources"],
    locationInformation: ["Location Information", "Manager Resources", "managerResources"],
    dailyBites: ["Daily Bites", "Manager Hub", "homeBase"],
    incidentHelper: ["Incident Record Helper", "Manager Hub", "homeBase"],
    schoolHub: ["School Dashboard", "Manager Hub", "homeBase"],
    schoolDashboard: ["Finish Line History", "School Dashboard", "schoolHub"],
    mealAnalytics: ["Meal Analytics", supervisorContext ? "Command Center" : "School Dashboard", supervisorContext ? "commandCenter" : "schoolHub"],
    finishLine: ["Finish Line", supervisorContext ? "Command Center" : editingCheck ? "Finish Line History" : "School Dashboard", supervisorContext ? "commandCenter" : editingCheck ? "schoolDashboard" : "schoolHub"],
  };
  const navigation = destinations[screen];
  usePageNavigation({ active: !!navigation, level: 0, title: navigation?.[0], destination: navigation?.[1], onNavigate: () => { setEditingCheck(null); setScreen(navigation[2]); } });

  useEffect(() => {
    function handleBeforeInstallPrompt(event) { event.preventDefault(); setInstallPrompt(event); setCanInstall(true); }
    function handleAppInstalled() { setInstallPrompt(null); setCanInstall(false); }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt); window.removeEventListener("appinstalled", handleAppInstalled); };
  }, []);

  useEffect(() => {
    const navigate = () => setScreen(current => window.location.hash === '#mystery-pull' ? 'mysteryPull' : current === 'mysteryPull' ? 'login' : current);
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);

  async function handleInstallApp() {
    if (installPrompt) {
      installPrompt.prompt();
      try { const choice = await installPrompt.userChoice; console.log(choice.outcome === "accepted" ? "SPARK installation accepted." : "SPARK installation dismissed."); } catch (error) { console.error("Install prompt error:", error); }
      setInstallPrompt(null); setCanInstall(false); return;
    }
    alert("To install SPARK on this computer, click the Install icon in the browser address bar, then select Install.");
  }

  function resetToLogin() { setSelectedLocation(null); setSelectedEmployee(null); setManagerSessionPin(""); setSupervisorSessionPin(""); setEditingCheck(null); setScreen("login"); }
  function managerPage(content) { return <>{content}<ManagerFeedback location={selectedLocation} employee={selectedEmployee} pageRoute={screen} /></>; }

  if (screen === "mysteryPull") return <MysteryPullPage onBack={() => { window.history.replaceState(null, "", window.location.pathname + window.location.search); resetToLogin(); }} />;
  if (screen === "login") return <LoginPage onMysteryPull={async (code) => { const session = await mysteryRpc("open", { p_code: code }); saveSession(session); window.location.hash = "mystery-pull"; setScreen("mysteryPull"); }} canInstall={canInstall} onInstall={handleInstallApp} onLocationSelected={(location) => { setSelectedLocation(location); setSelectedEmployee(null); setEditingCheck(null); setScreen("employeeSelect"); }} onSupervisor={() => { setEditingCheck(null); setScreen("supervisorPin"); }} />;
  if (screen === "supervisorPin") return <SupervisorPinPage onSuccess={(verifiedPin) => { setSupervisorSessionPin(verifiedPin); setScreen("commandCenter"); }} onBack={() => { setSupervisorSessionPin(""); setScreen("login"); }} />;
  if (screen === "employeeSelect") return <EmployeeSelectPage location={selectedLocation} onEmployeeSelected={(employee) => { setSelectedEmployee(employee); setEditingCheck(null); setScreen("managerPin"); }} onBack={resetToLogin} />;
  if (screen === "managerPin") return <ManagerPinPage location={selectedLocation} employee={selectedEmployee} onSuccess={(verifiedPin) => { setManagerSessionPin(verifiedPin); setScreen("homeBase"); }} onBack={() => { setSelectedEmployee(null); setManagerSessionPin(""); setScreen("employeeSelect"); }} />;
  if (screen === "homeBase") return managerPage(<HomeBase managerPin={managerSessionPin} location={selectedLocation} employee={selectedEmployee} onSchoolHub={() => setScreen("schoolHub")} onMonthlyScorecard={() => setScreen("managerMonthlyScorecard")} onIncidentHelper={() => setScreen("incidentHelper")} onDailyBites={() => setScreen("dailyBites")} onManagerResources={() => setScreen("managerResources")} onMonitoring={() => setScreen("monitoring")} onExit={resetToLogin} />);
  if (screen === "monitoring" && selectedLocation && selectedEmployee) return managerPage(<MonitoringPage location={selectedLocation} employee={selectedEmployee} managerPin={managerSessionPin} onBack={() => setScreen("homeBase")} />);
  if (screen === "managerMonthlyScorecard") return managerPage(<ManagerMonthlyScorecardPage location={selectedLocation} employee={selectedEmployee} managerPin={managerSessionPin} onBack={() => setScreen("homeBase")} />);
  if (screen === "managerResources") return managerPage(<ManagerResourcesPage onAskSpark={() => setScreen("askSpark")} onOperationsHelp={() => setScreen("operationsHelp")} onLocationInformation={() => setScreen("locationInformation")} onHowToEarnPoints={() => setScreen("howToEarnPoints")} onBack={() => setScreen("homeBase")} />);
  if (screen === "howToEarnPoints") return managerPage(<HowToEarnPointsPage onBack={() => setScreen("managerResources")} />);
  if (screen === "operationsHelp") return managerPage(<OperationsHelpPage location={selectedLocation} onBack={() => setScreen("managerResources")} />);
  if (screen === "askSpark") return managerPage(<AskSparkPage location={selectedLocation} onBack={() => setScreen("managerResources")} />);
  if (screen === "locationInformation") return managerPage(<LocationInformationPage location={selectedLocation} onBack={() => setScreen("managerResources")} />);
  if (screen === "dailyBites") return managerPage(<DailyBitesPage managerPin={managerSessionPin} location={selectedLocation} employee={selectedEmployee} onBack={() => setScreen("homeBase")} />);
  if (screen === "incidentHelper") return managerPage(<IncidentRecordHelper location={selectedLocation} employee={selectedEmployee} onBack={() => setScreen("homeBase")} />);
  if (screen === "schoolHub") return managerPage(<SchoolHub location={selectedLocation} employee={selectedEmployee} onFinishLine={() => { setEditingCheck(null); setScreen("finishLine"); }} onDashboard={() => setScreen("schoolDashboard")} onMealAnalytics={() => setScreen("mealAnalytics")} onExit={() => setScreen("homeBase")} />);
  if (screen === "mealAnalytics") {
    const page = <MealAnalyticsPage location={selectedLocation} employee={selectedEmployee} backLabel={supervisorContext ? "Command Center" : "School Dashboard"} onBack={() => setScreen(supervisorContext ? "commandCenter" : "schoolHub")} />;
    return supervisorContext ? page : managerPage(page);
  }

  if (screen === "finishLine") {
    const page = <FinishLinePage location={selectedLocation} employee={selectedEmployee} existingCheck={editingCheck} onBack={() => { const parent = supervisorContext ? "commandCenter" : editingCheck ? "schoolDashboard" : "schoolHub"; setEditingCheck(null); setScreen(parent); }} onComplete={() => { setEditingCheck(null); setScreen(supervisorContext ? "commandCenter" : "schoolDashboard"); }} />;
    return editingCheck?.previewMode ? page : managerPage(page);
  }

  if (screen === "schoolDashboard") return managerPage(<SchoolDashboard location={selectedLocation} employee={selectedEmployee} onBack={() => { setEditingCheck(null); setScreen("schoolHub"); }} onEditFinishLine={(check) => { setEditingCheck(check); setScreen("finishLine"); }} />);
  if (screen === "supervisorMonitoring") return <SupervisorMonitoringPage supervisorPin={supervisorSessionPin} onBack={() => setScreen("commandCenter")} />;
  if (screen === "commandCenter") return <CommandCenter onMonitoring={() => setScreen("supervisorMonitoring")} supervisorPin={supervisorSessionPin} onExit={resetToLogin} onOpenSchoolAnalytics={(school) => { setSelectedLocation(school); setScreen("mealAnalytics"); }} onPreviewFinishLine={(preview) => { setEditingCheck({ previewMode: true, previewDay: preview.day, previewMonthEnd: preview.monthEnd }); setScreen("finishLine"); }} />;
  return null;
}

export default function SparkApp() { return <PageNavigationProvider><App /></PageNavigationProvider>; }
