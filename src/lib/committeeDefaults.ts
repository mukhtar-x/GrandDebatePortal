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
        active: true,
    },
    {
        code: "DISEC",
        name: "Disarmament and International Security Committee",
        agenda: "To be announced",
        suitedTo: "All delegates",
        level: "All levels",
        totalSeats: 0,
        active: true,
    },
    {
        code: "SOCHUM",
        name: "Social, Humanitarian and Cultural Committee",
        agenda: "To be announced",
        suitedTo: "All delegates",
        level: "All levels",
        totalSeats: 0,
        active: true,
    },
    {
        code: "UN Women",
        name: "United Nations Entity for Gender Equality and the Empowerment of Women",
        agenda: "To be announced",
        suitedTo: "All delegates",
        level: "All levels",
        totalSeats: 0,
        active: true,
    },
    {
        code: "PNA",
        name: "Pakistan National Assembly",
        agenda: "To be announced",
        suitedTo: "All delegates",
        level: "All levels",
        totalSeats: 0,
        active: true,
    },
];
