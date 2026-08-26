"use client";
import React, { useEffect, useRef, useState,useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";
import { clinicsApi } from "@/lib/api";
import { canAccessAppointments, canViewPatients, canManageLabTests, canViewLabAppointments } from "@/lib/permissions";
import {
  BellIcon,
  BoxCubeIcon,
  CalenderIcon,
  ChevronDownIcon,
  DocsIcon,
  DollarLineIcon,
  GridIcon,
  GroupIcon,
  HorizontaLDots,
  ListIcon,
  PageIcon,
  PieChartIcon,
  PlugInIcon,
  TableIcon,
  UserCircleIcon,
  UserIcon,
} from "../icons/index";
import SidebarWidget from "./SidebarWidget";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
};

const navItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Dashboard",
    path: "/dashboard",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
      </svg>
    ),
    name: "AI Assistant",
    path: "/ai-assistant",
  },
  {
    icon: <TableIcon />,
    name: "Clinics",
    path: "/clinics",
  },
  {
    icon: <CalenderIcon />,
    name: "Appointments",
    subItems: [
      { name: "Doctor Appointment", path: "/appointments" },
      { name: "Lab Test Appointments", path: "/lab-test-appointments" },
    ],
  },
  {
    icon: <PageIcon />,
    name: "Patients",
    path: "/patients",
  },
  {
    icon: <UserIcon />,
    name: "Doctors",
    path: "/doctors",
  },
  {
    icon: <GroupIcon />,
    name: "Staff",
    path: "/staff",
  },
  {
    icon: <PieChartIcon />,
    name: "Reports",
    path: "/reports",
  },
  {
    icon: <PlugInIcon />,
    name: "Settings",
    path: "/settings",
  },
  {
    icon: <BoxCubeIcon />,
    name: "Calendar",
    path: "/calendar",
  },
  {
    icon: <DollarLineIcon />,
    name: "Payment Ledger",
    path: "/ledger",
  },
  {
    icon: <DocsIcon />,
    name: "Billing",
    path: "/billing",
  },
  {
    icon: <CalenderIcon />,
    name: "My Schedule",
    path: "/doctor-schedule",
  },
  {
    icon: <DocsIcon />,
    name: "Prescriptions",
    path: "/prescriptions",
  },
  // {
  //   icon: <BellIcon />,
  //   name: "Notifications",
  //   path: "/notifications",
  // },
  {
    icon: <UserCircleIcon />,
    name: "Profile",
    path: "/profile",
  },
];

const superAdminItems: NavItem[] = [
  {
    icon: <PieChartIcon />,
    name: "Statistics",
    path: "/super-admin",
  },
  {
    icon: <TableIcon />,
    name: "Clinics",
    path: "/super-admin/clinics",
  },
  {
    icon: <DollarLineIcon />,
    name: "Payments",
    path: "/super-admin/payments",
  },
  {
    icon: <BoxCubeIcon />,
    name: "Plans",
    path: "/super-admin/plans",
  },
  {
    icon: <ListIcon />,
    name: "Audit Logs",
    path: "/super-admin/audit-logs",
  },
  {
    icon: <GroupIcon />,
    name: "Admins",
    path: "/super-admin/admins",
  },
  {
    icon: <PlugInIcon />,
    name: "Settings",
    path: "/super-admin/settings",
  },
];

// Nav item `name` values are stable identifiers used for filtering/keys
// throughout this file — this maps each one to its sidebar.* translation key
// so the displayed label can be localized without touching that logic.
const NAV_LABEL_KEYS: Record<string, string> = {
  Dashboard: "sidebar.dashboard",
  "AI Assistant": "sidebar.aiAssistant",
  Clinics: "sidebar.clinics",
  Appointments: "sidebar.appointments",
  "Doctor Appointment": "sidebar.doctorAppointment",
  "Lab Test Appointments": "sidebar.labTestAppointments",
  Patients: "sidebar.patients",
  Doctors: "sidebar.doctors",
  Staff: "sidebar.staff",
  Reports: "sidebar.reports",
  Settings: "sidebar.settings",
  Calendar: "sidebar.calendar",
  "Payment Ledger": "sidebar.paymentLedger",
  Billing: "sidebar.billing",
  "My Schedule": "sidebar.mySchedule",
  Prescriptions: "sidebar.prescriptions",
  Profile: "sidebar.profile",
  Notifications: "sidebar.notifications",
  "Lab Tests": "sidebar.labTests",
  "Branch Tests": "sidebar.branchTests",
  "Lab Schedule": "sidebar.labSchedule",
  Statistics: "sidebar.statistics",
  Payments: "sidebar.payments",
  Plans: "sidebar.plans",
  "Audit Logs": "sidebar.auditLogs",
  Admins: "sidebar.admins",
};

const othersItems: NavItem[] = [
  {
    icon: <PieChartIcon />,
    name: "Charts",
    subItems: [
      { name: "Line Chart", path: "/line-chart", pro: false },
      { name: "Bar Chart", path: "/bar-chart", pro: false },
    ],
  },
  {
    icon: <BoxCubeIcon />,
    name: "UI Elements",
    subItems: [
      { name: "Alerts", path: "/alerts", pro: false },
      { name: "Avatar", path: "/avatars", pro: false },
      { name: "Badge", path: "/badge", pro: false },
      { name: "Buttons", path: "/buttons", pro: false },
      { name: "Images", path: "/images", pro: false },
      { name: "Videos", path: "/videos", pro: false },
    ],
  },
  {
    icon: <PlugInIcon />,
    name: "Authentication",
    subItems: [
      { name: "Sign In", path: "/signin", pro: false },
      { name: "Sign Up", path: "/signup", pro: false },
    ],
  },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const { user, can, staffClinic, clinic } = useAuth();
  const { t } = useTranslation();
  const navLabel = (name: string) => t(NAV_LABEL_KEYS[name] ?? name);

  const isOwner = user?.role === "clinic_owner" || user?.role === "sys_admin";
  const isStaff = user?.role === "branch_staff";
  const isSuperAdmin = user?.role === "sys_admin";
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The Clinics menu item points straight at the owner's clinic overview.
  // The cached login clinic is preferred; when the session has none (stale
  // storage, super admin, etc.) resolve it from the API like /clinics does.
  const [resolvedClinicId, setResolvedClinicId] = useState<string | null>(null);
  useEffect(() => {
    if (!isOwner || clinic?.id) return;
    let active = true;
    clinicsApi
      .list({ limit: 1 })
      .then((res) => {
        if (active && res.items[0]) setResolvedClinicId(res.items[0].id);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOwner, clinic]);

  const clinicsTargetId = clinic?.id ?? resolvedClinicId;

  const mainItems = React.useMemo(() => {
    const filtered = navItems
      .filter((item) => {
        if (!mounted) return true; // render full list on server + first client pass
        switch (item.name) {
          case "Clinics": return isOwner;
          case "Staff": return isOwner || can("staff:manage");
          case "Doctors": return isOwner || can("doctors:manage");
          case "Patients": return isOwner || canViewPatients(user?.permissions);
          case "Reports": return isOwner;
          case "Settings": return isOwner;
          case "Payment Ledger": return isOwner;
          case "Billing": return isOwner;
          case "My Schedule": return user?.role === "doctor";
          // Shown if either sub-item would be — each is filtered individually below.
          case "Appointments": return isOwner || canAccessAppointments(user?.permissions) || canViewLabAppointments(user?.permissions);
          case "Calendar": return isOwner || canAccessAppointments(user?.permissions);
          case "Notifications": return !isStaff;
          default: return true;
        }
      })
      .map((item) => {
        if (item.name !== "Appointments" || !item.subItems || !mounted) return item;
        return {
          ...item,
          subItems: item.subItems.filter((sub) => {
            if (sub.name === "Doctor Appointment") return isOwner || canAccessAppointments(user?.permissions);
            if (sub.name === "Lab Test Appointments") return isOwner || canViewLabAppointments(user?.permissions);
            return true;
          }),
        };
      });

    // The clinic-list page is skipped — the Clinics item goes straight to the
    // owner's clinic overview section (the /clinics route itself redirects
    // there too; this just avoids the hop).
    if (mounted && clinicsTargetId) {
      const clinicsIndex = filtered.findIndex((i) => i.name === "Clinics");
      if (clinicsIndex !== -1) {
        filtered[clinicsIndex] = {
          ...filtered[clinicsIndex],
          path: `/clinics/${clinicsTargetId}/overview`,
        };
      }
    }

    // Owners manage lab tests/schedules from the Clinics/Branches pages (per
    // clinic if it has a single branch, per branch row otherwise) rather than a
    // standalone nav item. Branch staff never see those admin pages, so they
    // keep a direct shortcut straight to their own (single) branch's pages.
    if (!mounted || isOwner || !canManageLabTests(user?.permissions)) return filtered;
    const clinicId = staffClinic?.id;
    const branchId = user?.branch_id;
    if (!clinicId || !branchId) return filtered;

    const staffLabItems: NavItem[] = [
      { icon: <BoxCubeIcon />, name: "Lab Tests", path: `/clinics/${clinicId}/lab-tests` },
      { icon: <ListIcon />, name: "Branch Tests", path: `/clinics/${clinicId}/branches/${branchId}/lab-tests` },
      { icon: <CalenderIcon />, name: "Lab Schedule", path: `/clinics/${clinicId}/branches/${branchId}/lab-schedule` },
    ];
    const appointmentsIndex = filtered.findIndex((i) => i.name === "Appointments");
    const insertIndex = appointmentsIndex === -1 ? filtered.length : appointmentsIndex + 1;
    return [...filtered.slice(0, insertIndex), ...staffLabItems, ...filtered.slice(insertIndex)];
  }, [mounted, isOwner, isStaff, can, user, staffClinic, clinicsTargetId]);
  const showOthers = isOwner || !isStaff;

  const renderMenuItems = (
    navItems: NavItem[],
    menuType: "main" | "others"
  ) => (
    <ul className="flex flex-col gap-4">
      {navItems.map((nav, index) => {
        return (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index, menuType)}
              className={`menu-item group  ${
                openSubmenu?.type === menuType && openSubmenu?.index === index
                  ? "menu-item-active"
                  : "menu-item-inactive"
              } cursor-pointer ${
                !isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "lg:justify-start"
              }`}
            >
              <span
                className={` ${
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }`}
              >
                {nav.icon}
              </span>
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className={`menu-item-text`}>{navLabel(nav.name)}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDownIcon
                  className={`ml-auto w-5 h-5 transition-transform duration-200  ${
                    openSubmenu?.type === menuType &&
                    openSubmenu?.index === index
                      ? "rotate-180 text-brand-500"
                      : ""
                  }`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              <Link
                href={nav.path}
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
              >
                <span
                  className={`${
                    isActive(nav.path)
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className={`menu-item-text`}>{navLabel(nav.name)}</span>
                )}
              </Link>
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            <div
              ref={(el) => {
                subMenuRefs.current[`${menuType}-${index}`] = el;
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? `${subMenuHeight[`${menuType}-${index}`]}px`
                    : "0px",
              }}
            >
              <ul className="mt-2 space-y-1 ml-9">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      href={subItem.path}
                      className={`menu-dropdown-item ${
                        isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                      }`}
                    >
                      {navLabel(subItem.name)}
                      <span className="flex items-center gap-1 ml-auto">
                        {subItem.new && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge `}
                          >
                            new
                          </span>
                        )}
                        {subItem.pro && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge `}
                          >
                            pro
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
        );
      })}
    </ul>
  );

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main" | "others";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>(
    {}
  );
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // const isActive = (path: string) => path === pathname;
   const isActive = useCallback((path: string) => path === pathname, [pathname]);

  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    // React-recommended derived state: recompute the open submenu when the
    // route changes, without triggering an effect.
    setLastPathname(pathname);
    let submenuMatched = false;
    ["main", "others"].forEach((menuType) => {
      const items = menuType === "main" ? navItems : othersItems;
      items.forEach((nav, index) => {
        if (nav.subItems && nav.subItems.some((subItem) => isActive(subItem.path))) {
          setOpenSubmenu({ type: menuType as "main" | "others", index });
          submenuMatched = true;
        }
      });
    });
    if (!submenuMatched) {
      setOpenSubmenu(null);
    }
  }

  useEffect(() => {
    // Set the height of the submenu items when the submenu is opened
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (index: number, menuType: "main" | "others") => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === menuType &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 
        ${
          isExpanded || isMobileOpen
            ? "w-[290px]"
            : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-8 flex  ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
        <Link href="/dashboard">
          {isExpanded || isHovered || isMobileOpen ? (
            <>
              <Image
                className="dark:hidden"
                src="/images/logo/logo.png"
                alt="Logo"
                width={150}
                height={40}
              />
              <Image
                className="hidden dark:block"
                src="/images/logo/logo-dark.png"
                alt="Logo"
                width={150}
                height={40}
              />
            </>
          ) : (
            <Image
              src="/icon.png"
              alt="Logo"
              width={32}
              height={32}
            />
          )}
        </Link>
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            {(!isSuperAdmin || !mounted) && (
              <div>
                <h2
                  className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                    !isExpanded && !isHovered
                      ? "lg:justify-center"
                      : "justify-start"
                  }`}
                >
                  {isExpanded || isHovered || isMobileOpen ? (
                    t("sidebar.menu")
                  ) : (
                    <HorizontaLDots />
                  )}
                </h2>
                {renderMenuItems(mainItems, "main")}
              </div>
            )}

            {isSuperAdmin && mounted && (
              <div>
                <h2
                  className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                    !isExpanded && !isHovered
                      ? "lg:justify-center"
                      : "justify-start"
                  }`}
                >
                  {isExpanded || isHovered || isMobileOpen ? t("sidebar.superAdmin") : <HorizontaLDots />}
                </h2>
                {renderMenuItems(superAdminItems, "main")}
              </div>
            )}

            {showOthers && (
              <div className="">
                <h2
                  className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                    !isExpanded && !isHovered
                      ? "lg:justify-center"
                      : "justify-start"
                  }`}
                >
                  {/* {isExpanded || isHovered || isMobileOpen ? (
                    "Others"
                  ) : (
                    <HorizontaLDots />
                  )} */}
                </h2>
                {/* {renderMenuItems(othersItems, "others")} */}
              </div>
            )}
          </div>
        </nav>
        {isExpanded || isHovered || isMobileOpen ? <SidebarWidget /> : null}
      </div>
    </aside>
  );
};

export default AppSidebar;
