import { readFile, writeFile } from "node:fs/promises";
import { Booking, Room } from "./models.js";
import { isBooking, isRoom } from "./guard.js";

// One generic loader for any list stored as JSON.
async function loadList<T>(
  file: string,
  guard: (item: unknown) => item is T
): Promise<T[]> {
  try {
    const text = await readFile(file, "utf-8");
    const data: unknown = JSON.parse(text);

    if (!Array.isArray(data)) {
      throw new Error(`Data in ${file} is not a list`);
    }

    for (const item of data) {
      if (!guard(item)) {
        throw new Error(`Invalid item in ${file}: ${JSON.stringify(item)}`);
      }
    }

    return data;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      console.log(`No ${file} yet, starting empty.`);
      return []; // no file yet: not a real error
    }
    throw err; // anything else: let main() report it
  }
}

export const loadRooms = () => loadList<Room>("rooms.json", isRoom);
export const loadBookings = () => loadList<Booking>("bookings.json", isBooking);

export async function saveBookings(bookings: Booking[]): Promise<void> {
  await writeFile("bookings.json", JSON.stringify(bookings, null, 2), "utf-8");
}
