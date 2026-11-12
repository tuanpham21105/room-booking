import { Booking, Room, RoomName, Status } from "./models.js";
import { Repository } from "./repository.js";
import { cost, printReport, time, vnd, overlaps, mark, clashWith } from "./report.js";
import { loadBookings, loadRooms, saveBookings } from "./storage.js";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { writeFile } from "fs/promises";

const rl = createInterface({ input, output });

const ROOM_NAMES: RoomName[] = ["Sky", "Ocean", "Forest"];

// A type guard: checks at run time that a string really is a RoomName.
function isRoomName(value: string | undefined): value is RoomName {
  return ROOM_NAMES.includes(value as RoomName);
}

const [rooms, bookings] = await Promise.all([
  loadRooms().catch((err) => {
    console.error("Failed to load rooms:", (err as Error).message);
    return [];
  }),
  loadBookings().catch((err) => {
    console.error("Failed to load bookings:", (err as Error).message);
    return [];
  }),
]);
const roomRepo = new Repository<Room>(rooms);
const bookingRepo = new Repository<Booking>(bookings);

function help(): void {
  console.log(
`
list <date>: get list of bookings at date, <date> is optional
book: create new booking
confirm <id>: confirm a pending booking, <id> is required
cancel <id>: cancel a pending booking, <id> is required
available <room> <date>: check available time of room at date, <room> and <date> required
revenue <date>: calculate revenue at date, <date> is optional
export <date>: export schedule list at date to Markdown file, <date> is optional
exit: exit the program
`
  );
}

function list(date: string = ""): void {
    date = date.trim();
    const list = date.length > 0 ? bookingRepo.getAll().filter((b) => b.date === date) : bookingRepo.getAll();
    console.log(`Bookings for ${date.length > 0 ? date : `all`} (${list.length})`);
    printReport(list, roomRepo.getAll());
}

async function book(): Promise<void> {
  console.log("\nBooking");
  const customer = await rl.question("Customer: ");
  const roomNamesString: string[] = ROOM_NAMES.map((n) => n.toString())
  if (customer) {
    const room = await rl.question(`Room (${roomNamesString.reduce<string>((line, v, index) => index === 0 ? v : line + ", " + v, "")    }): `);
    if (!isRoomName(room)) throw new Error(`Unknown room: ${room}`);

    const start = Number(await rl.question("Start (number in range 0 to 23): "));
    if (isNaN(start) || start < 0 || start > 23) {
      throw new Error("start must be whole number in range 0 to 23");
    }

    const hours = Number(await rl.question("Hours: "));
    if (isNaN(hours)) {
      throw new Error("hours must be whole number");
    }

    const date = await rl.question("Date: ");

    const booking: Booking = {
      id: `bk-${Date.now()}`,
      room,
      customer,
      date,
      start: start,
      hours: hours,
      status: Status.Pending,
    };
    const list = bookingRepo.getAll().filter((b) => b.status !== Status.Cancelled && b.date == date && b.room == room); 
    const clash = list.find((o) => o.status !== Status.Cancelled && overlaps(o, booking));
    if (clash) 
    {
      console.log(` ⚠ overlaps ${clash.id}`);
      return;
    }
    bookingRepo.add(booking);
    await saveBookings(bookingRepo.getAll());
    console.log(`+ Booked: ${room} ${time(booking.start)}-${time(booking.start + booking.hours)} for ${customer}`);
    console.log(`Saved ${bookingRepo.getAll().length} bookings to bookings.json`);
  }
  else {
    throw new Error(`Unknown customer: ${customer}`);
  }
}

async function confirm(bookingId: string): Promise<void> {
  if (bookingId) {

    const booking = bookingRepo.findById(bookingId);

    if (!booking) 
    {
      console.log(`Booking with ID ${bookingId} is not existed`);
      return;
    }

    if (booking.status !== Status.Pending) {
      console.log(`Booking with ID ${bookingId} is already ${booking.status}`);
      return;
    }

    booking.status = Status.Confirmed;

    bookingRepo.update(bookingId, booking);

    await saveBookings(bookingRepo.getAll());
    console.log(`+ Confirm: ${booking.room} ${time(booking.start)}-${time(booking.start + booking.hours)} for ${booking.customer}`);
    console.log(`Saved ${bookingRepo.getAll().length} bookings to bookings.json`);
  }
}

async function cancel(bookingId: string): Promise<void> {
  if (bookingId) {

    const booking = bookingRepo.findById(bookingId);

    if (!booking) 
    {
      console.log(`Booking with ID ${bookingId} is not existed`);
      return;
    }

    if (booking.status !== Status.Pending) {
      console.log(`Booking with ID ${bookingId} is already ${booking.status}`);
      return;
    }

    booking.status = Status.Cancelled;

    bookingRepo.update(bookingId, booking);

    await saveBookings(bookingRepo.getAll());
    console.log(`- Cancel: ${booking.room} ${time(booking.start)}-${time(booking.start + booking.hours)} for ${booking.customer}`);
    console.log(`Saved ${bookingRepo.getAll().length} bookings to bookings.json`);
  }
}

function available(room: string, date: string): void {
  if (!isRoomName(room)) throw new Error(`Unknown room: ${room}`);

  date = date.trim();

  let placeholder: Booking = {
      id: "",
      room,
      customer: "",
      date,
      start: 0,
      hours: 1,
      status: Status.Pending,
    };
  const list = bookingRepo.getAll().filter((b) => b.status !== Status.Cancelled && b.date == date && b.room == room);
  for (let i = 0; i < 24; i++) {
    const clash = list.find((o) => o.status !== Status.Cancelled && overlaps(o, placeholder));
    const line = `${time(placeholder.start)}-${time(placeholder.start + placeholder.hours)}  ` + (clash ? `✖ Unavailable  ⚠ overlaps ${clash.id}` : "✔ Available");
    console.log(line);
    placeholder.start++;
  }
}

function revenue(date: string = ""): void {
  date = date.trim();
  const list = date.length > 0 ? bookingRepo.getAll().filter((b) => b.date === date) : bookingRepo.getAll();
  const confirmed = list.filter((b) => b.status === Status.Confirmed);
  const amounts = confirmed.map((b) => cost(b, roomRepo.getAll()));
  const revenue = amounts.reduce((sum, a) => sum + a, 0);
  console.log(`Revenue ${date.length > 0 ? 'at ' + date : 'all'} (confirmed): ${vnd(revenue)}`);
}

async function exportMd(date: string = ""): Promise<void> {
  date = date.trim();
  const list = date.length > 0 ? bookingRepo.getAll().filter((b) => b.date === date) : bookingRepo.getAll();
  const header: string = 
`# Booking Schedule list

## Bookings for ${date.length > 0 ? date : `all`} (${list.length})
`;

  const tableHeader: string =
`
|States|ID|Date|Hours|Room|Customer|Cost|Overlap|
|---|---|---|---|---|---|---|---|
`;

  const tableBody = list.reduce(
    (p, c, i) => 
    {
      const clash = clashWith(c, bookingRepo.getAll());
      const slot = `${time(c.start)}-${time(c.start + c.hours)}`;
      const warn = clash ? `⚠ overlaps ${clash.customer}` : "";

      return p + `|${mark(c.status)}|${c.id}|${c.date}|${slot}|${c.room}|${c.customer}|${cost(c, roomRepo.getAll())}|${warn}|\n`;
    }
  , "")

  await writeFile(`exported_schedule_${Date.now()}.md`, header + tableHeader + tableBody, "utf-8");

  console.log("+ Export schedule list to Markdown file completed");
}

async function commandsInput(): Promise<string> {
  console.log("\nBooking CLI");

  let input = await rl.question("Command(type \'help\' for help): ");
  while (input.length === 0) {
    input = await rl.question("Command(type \'help\' for help): ");
  }

  return input;
} 

async function commandHandle(cmd: string): Promise<void> {
  cmd = cmd.trim();
  const cmdParts: string[] = cmd.split(" ");
  const params = cmdParts.slice(1);

  if (cmdParts.length === 0) {
    console.log("Invalid command");
    return;
  }
  try {
    switch (cmdParts[0]) {
      case "help":
        help();
        break;
      case "list":
        if (params.length != 0) 
          list(params[0]);
        else
          list();
        break;
      case "book":
        await book();
        break;
      case "confirm":
        if (params.length != 0) 
          await confirm(params[0]);
        else
          throw new Error("Booking ID is missing");
        break;
      case "cancel":
        if (params.length != 0) 
          await cancel(params[0]);
        else
          throw new Error("Booking ID is missing");
        break;
      case "available":
        if (params.length == 0)
          throw new Error("Room name and Date is missing");
        if (params.length == 1)
          throw new Error("Date is missing");
        available(params[0], params[1]);
        break;
      case "revenue":
        if (params.length != 0) 
          revenue(params[0]);
        else
          revenue();
        break;
      case "export":
        if (params.length != 0) 
          exportMd(params[0]);
        else
          exportMd();
        break;
      default:
        console.log("Invalid command");
    }
  }
  catch (err) {
    console.error("Something went wrong:", (err as Error).message);
  }
} 

async function main(): Promise<void> {
  let isExit = false;

  while (!isExit) {
    const input = await commandsInput();
    isExit = input === "exit";
    if (isExit)
      break;
    await commandHandle(input);
  }

  rl.close()
}

main().catch((err) => {
  
});