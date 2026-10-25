import type { ICommittee } from "@/models/Committee";

export type CommitteeOption = Pick<
    ICommittee,
    "code" | "name" | "agenda" | "suitedTo" | "level" | "totalSeats" | "studyGuideUrl" | "active"
>;

export const DEFAULT_COMMITTEE_OPTIONS: CommitteeOption[] = [
    {
        code: "UNSC",
        name: "United Nations Security Council",
        agenda: "To be announced",
        suitedTo: "All delegates",
        level: "All levels",
        totalSeats: 0,
        studyGuideUrl: "/docs/committees/unsc-study-guide.pdf",
        active: true,
    },
    {
        code: "DISEC",
        name: "Disarmament and International Security Committee",
        agenda: "To be announced",
        suitedTo: "All delegates",
        level: "All levels",
        totalSeats: 0,
        studyGuideUrl: "/docs/committees/disec-study-guide.pdf",
        active: true,
    },
    {
        code: "SOCHUM",
        name: "Social, Humanitarian and Cultural Committee",
        agenda: "To be announced",
        suitedTo: "All delegates",
        level: "All levels",
        totalSeats: 0,
        studyGuideUrl: "/docs/committees/sochum-study-guide.pdf",
        active: true,
    },
    {
        code: "UN Women",
        name: "United Nations Entity for Gender Equality and the Empowerment of Women",
        agenda: "To be announced",
        suitedTo: "All delegates",
        level: "All levels",
        totalSeats: 0,
        studyGuideUrl: "/docs/committees/unwomen-study-guide.pdf",
        active: true,
    },
    {
        code: "PNA",
        name: "Pakistan National Assembly",
        agenda: "To be announced",
        suitedTo: "All delegates",
        level: "All levels",
        totalSeats: 0,
        studyGuideUrl: "/docs/committees/pna-study-guide.pdf",
        active: true,
    },
];
