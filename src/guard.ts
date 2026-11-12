import { Booking, Room, RoomName, Status } from "./models.js";

const ROOM_NAMES: RoomName[] = ["Sky", "Ocean", "Forest"];

export function isRoomName(value: unknown): value is RoomName {                                                                                                                         
    return typeof value === "string" && ROOM_NAMES.includes(value as RoomName);                                                                                                           
}

export function isStatus(value: unknown): value is Status {
    return typeof value === "string" && Object.values(Status).includes(value as Status);
}

export function isRoom(item: unknown): item is Room {
    if (typeof item !== "object" || item === null) return false;
    const r = item as Record<string, unknown>;

    return (
        isRoomName(r.id) &&
        typeof r.pricePerHour === "number" &&
        r.pricePerHour >= 0
    );
}

export function isBooking(item: unknown): item is Booking {
    if (typeof item !== "object" || item === null) return false;
    const b = item as Record<string, unknown>;

    return (
        typeof b.id === "string" &&
        isRoomName(b.room) && 
        typeof b.customer === "string" &&
        typeof b.date === "string" &&
        typeof b.start === "number" &&
        b.start >= 0 &&
        b.start <= 23 &&
        typeof b.hours === "number" &&
        b.hours > 0 &&
        isStatus(b.status)
    );
}