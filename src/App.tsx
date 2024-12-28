/// <reference types="web-bluetooth" />
import {
  type Accessor,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  Show,
} from "solid-js";
import { Button } from "./components/ui/button";

const commands = {
  READ_HISTORY: 0,
  READ_USER_ID_AND_VERSION_DATA: 5,
  READ_LAST_DATA: 7,
} as const;

type Measurement = {
  systole: number;
  dia: number;
  hr: number;
  yearShort: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  // byte 8 splits to:
  cuffIsOk: boolean;
  ihb: boolean;
  afib: boolean;
  // 2 bits
  mam: 0 | 1 | 2 | 3;
  // ?
  // ?
  // ?
};

type HistoryRetrieval = {
  mode: number;
  noOfCurrentMeasurement: number;
  historyMeasuremeNumber: number;
  userNumber: number;
  mamState: number;
  measurements: Measurement[];
};

type VersionResponse = {
  fwVersion: string;
  year: number;
  month: number;
  day: number;
  maxUser: number;
  maxMemory: number;
  option_tubeless: boolean;
  option_g_sensor: boolean;
  option_single_cycle_afib: boolean;
  option_isArm: boolean;
  option_mam: boolean;
  option_afib: boolean;
  option_ihb: boolean;
  deviceBatt: number;
  p_id: string;
  arrName: string;
  currentMode: number;
};

type UserResponse = {
  no: number;
  id: string;
  age: number;
};

type UserAndVersionResponse = {
  version: VersionResponse;
  currentUserNo: number;
  user1: UserResponse;
  user2: UserResponse;
};

type LastDataResponse = {
  measurement: Measurement;
};

function CheckPermission() {
  const [bleAvailable] = createResource(
    () => "bluetooth" in navigator && navigator.bluetooth.getAvailability()
  );

  return (
    <Show when={bleAvailable} fallback={<div>Bluetooth not available</div>}>
      <SearchBle />
    </Show>
  );
}

function SearchBle() {
  const [bleDevice, setBleDevice] = createSignal<BluetoothDevice>();

  const handleSearch = () => {
    navigator.bluetooth
      .requestDevice({
        filters: [
          {
            services: ["0000fff0-0000-1000-8000-00805f9b34fb"],
          },
        ],
      })
      .then(setBleDevice);
  };

  return (
    <Show
      when={bleDevice()}
      fallback={<Button onclick={handleSearch}>Search for device</Button>}
    >
      {(device) => <BleDevice device={device()} />}
    </Show>
  );
}

function BleDevice(props: { device: BluetoothDevice }) {
  const [gatt, setGatt] = createSignal<BluetoothRemoteGATTServer>();

  createEffect(() => {
    // props.device.addEventListener("gattserverdisconnected", (e) => {
    //   console.log("gattserverdisconnected", e);
    //   setGatt(undefined);
    // });

    // props.device.addEventListener("advertisementreceived", (e) =>
    //   console.log("advertisementreceived", e)
    // );

    // console.log("start watch advertisements on device");
    // props.device.watchAdvertisements();

    props.device.gatt?.connect().then(setGatt);
  });

  createEffect(() => {
    const g = gatt();
    if (!g) return;

    onCleanup(() => {
      console.error("DISCONNECTING!", g, "current", gatt());
      if (g.connected) g.disconnect();
    });
  });

  return (
    <Show when={gatt()} fallback={<div>Connect to gatt</div>}>
      {(gatt) => <Gatt gatt={gatt()} />}
    </Show>
  );
}

function Gatt(props: { gatt: BluetoothRemoteGATTServer }) {
  const [service, setService] = createSignal<BluetoothRemoteGATTService>();

  createEffect(() => {
    props.gatt
      .getPrimaryService("0000fff0-0000-1000-8000-00805f9b34fb")
      .then(setService);
  });
  return (
    <Show when={service()} fallback={<div>connect to service</div>}>
      {(service) => <GattService service={service()} />}
    </Show>
  );
}

function GattService(props: { service: BluetoothRemoteGATTService }) {
  // notify 0000fff1-0000-1000-8000-00805f9b34fb
  // write 0000fff2-0000-1000-8000-00805f9b34fb

  const [readCharacteristic, setReadCharacteristic] =
    createSignal<BluetoothRemoteGATTCharacteristic>();
  const [writeCharacteristic, setWriteCharacteristic] =
    createSignal<BluetoothRemoteGATTCharacteristic>();

  createEffect(() => {
    props.service
      .getCharacteristic("0000fff1-0000-1000-8000-00805f9b34fb")
      .then(setReadCharacteristic);
    props.service
      .getCharacteristic("0000fff2-0000-1000-8000-00805f9b34fb")
      .then(setWriteCharacteristic);
  });

  const characteristics = createMemo(() => {
    const read = readCharacteristic();
    if (!read) return;
    const write = writeCharacteristic();
    if (!write) return;
    return {
      read,
      write,
    };
  });

  return (
    <Show when={characteristics()}>
      {(characteristics) => (
        <Characteristics
          read={characteristics().read}
          write={characteristics().write}
        />
      )}
    </Show>
  );
}

type Command = {
  id: 0;
};

function useReadCharacteristicData(
  read: Accessor<BluetoothRemoteGATTCharacteristic>,
  onRead: (data: number[]) => void
) {
  let tempDataList: number[] = [];
  let targetLength = 0;

  createEffect(() => {
    const r = read();
    const handle = () => {
      if (!r.value) {
        tempDataList = [];
        targetLength = 0;
        return;
      }

      const currentValue = new Uint8Array(r.value.buffer);

      if (targetLength === 0 && currentValue[0] === 0x4d) {
        targetLength = (currentValue[2] << 8) + currentValue[3] + 4;
      }

      tempDataList = [...tempDataList, ...currentValue];

      if (tempDataList.length === targetLength) {
        onRead(tempDataList);
        tempDataList = [];
        targetLength = 0;
      }
    };
    r.addEventListener("characteristicvaluechanged", handle);
    onCleanup(() =>
      r.removeEventListener("characteristicvaluechanged", handle)
    );
  });

  return {
    // sendCommandWithResponse: (command: Command) => {
    //   // [
    //   //   ...[0x4d, 0xff, 0x00, 0x09, READ_HISTORY],
    //   //   ...[0x0, 0x0, 0x0, 0x0, 0x0, 0x0],
    //   //   ...[
    //   //     selectUser,
    //   //     EC_TOO_MANY_USER_ACTION_CALLS + READ_HISTORY + selectUser,
    //   //   ],
    //   // ]
    //   write.writeValue(Uint8Array.from([0x4d, 0xff, 0x00, 0x02, 0x0b, 0x59]));
    // },
  };
}

async function* l(
  read: BluetoothRemoteGATTCharacteristic,
  write: BluetoothRemoteGATTCharacteristic
) {
  yield 4;
}

function Characteristics(props: {
  read: BluetoothRemoteGATTCharacteristic;
  write: BluetoothRemoteGATTCharacteristic;
}) {
  useReadCharacteristicData(
    () => props.read,
    (data) => {
      console.log("DATA READ", data);
      if (data[4] === commands.READ_HISTORY) {
        const ret: HistoryRetrieval = {
          mode: data[5],
          noOfCurrentMeasurement: data[6],
          historyMeasuremeNumber: data[7],
          userNumber: data[8],
          mamState: data[9],
          measurements: new Array(data[7]).fill(0).map((_, i) => {
            const offset = 42 + i * 10;
            const binaryData = data[offset + 8];
            return {
              systole: data[offset + 0],
              dia: data[offset + 1],
              hr: data[offset + 2],
              yearShort: data[offset + 3],
              month: data[offset + 4],
              day: data[offset + 5],
              hour: data[offset + 6],
              minute: data[offset + 7],
              cuffIsOk: (binaryData & 0b10000000) !== 0,
              ihb: (binaryData & 0b01000000) !== 0,
              afib: (binaryData & 0b00100000) !== 0,
              mam: ((binaryData & 0b00011000) >> 3) as 0 | 1 | 2 | 3,
            };
          }),
        };
        console.log("READ_HISTORY", ret);
      }
      if (data[4] === commands.READ_USER_ID_AND_VERSION_DATA) {
        const userNo = data[5];
        const user1Id = Array.from(
          Iterator.from(data)
            .drop(6)
            .take(20)
            .map((x) => String.fromCharCode(x))
        ).join("");
        const user1Age = data[26];
        const user2Id = Array.from(
          Iterator.from(data)
            .drop(27)
            .take(20)
            .map((x) => String.fromCharCode(x))
        ).join("");
        const user2Age = data[47];
        // TODO some condition when user age is set to 0
        const fwVersion = Array.from(
          Iterator.from(data)
            .drop(48)
            .take(3)
            .map((x) => String.fromCharCode(x))
        ).join("");
        const binaryFlags = data[56];

        let arrName = "";
        const arrNameId = data[60];
        if (arrNameId === 0) {
          arrName = "Don’t Display";
        } else if (arrNameId === 1) {
          arrName = "Display IHB";
        } else if (arrNameId === 2) {
          arrName = "Display PAD";
        }

        const ret: UserAndVersionResponse = {
          currentUserNo: userNo,
          user1: {
            no: 1,
            id: user1Id,
            age: user1Age,
          },
          user2: {
            no: 2,
            id: user2Id,
            age: user2Age,
          },
          version: {
            fwVersion: fwVersion,
            year: data[51] + 2000,
            month: data[52],
            day: data[53],
            maxUser: data[54],
            maxMemory: data[55],
            option_tubeless: (binaryFlags & 0b01000000) !== 0,
            option_g_sensor: (binaryFlags & 0b00100000) !== 0,
            option_single_cycle_afib: (binaryFlags & 0b00010000) !== 0,
            option_isArm: (binaryFlags & 0b00001000) !== 0,
            option_mam: (binaryFlags & 0b00000100) !== 0,
            option_afib: (binaryFlags & 0b00000010) !== 0,
            option_ihb: (binaryFlags & 0b00000001) !== 0,
            deviceBatt: data[57] / 10,
            // TODO fallback to 1.0 if data[58] === 0
            p_id: `V${Math.floor(data[58] / 10)}.${data[58] % 10}.${data[59]}`,
            arrName: arrName,
            currentMode: data[61],
          },
        };
        console.log("READ_USER_ID_AND_VERSION_DATA", ret);
      }
      if (data[4] === commands.READ_LAST_DATA) {
        const binaryFlags = data[20];
        const ret: LastDataResponse = {
          measurement: {
            systole: data[12],
            dia: data[13],
            hr: data[14],
            yearShort: data[15],
            month: data[16],
            day: data[17],
            hour: data[18],
            minute: data[19],
            cuffIsOk: (binaryFlags & 0b10000000) !== 0,
            ihb: (binaryFlags & 0b01000000) !== 0,
            afib: (binaryFlags & 0b00100000) !== 0,
            mam: ((binaryFlags & 0b00011000) >> 3) as 0 | 1 | 2 | 3,
          },
        };
        console.log("READ_LAST_DATA", ret);
      }
    }
  );

  createEffect(() => {
    // props.read.addEventListener("characteristicvaluechanged", (e) => {
    //   const value = props.read.value;
    //   console.log("read value", value);
    //   d = [...d, ...new Uint8Array(value!.buffer)];
    //   console.log("combined data:", d);
    // });
    props.read.startNotifications();

    onCleanup(() => {
      props.read.stopNotifications();
    });
  });

  return (
    <div class="flex flex-col">
      <Button
        onclick={() => {
          const READ_HISTORY = 0x00;
          // indexed 1
          const selectUser = 2;
          const EC_TOO_MANY_USER_ACTION_CALLS = 341;
          const data = Uint8Array.from([
            ...[0x4d, 0xff, 0x00, 0x09, READ_HISTORY],
            ...[0x0, 0x0, 0x0, 0x0, 0x0, 0x0],
            ...[
              selectUser,
              EC_TOO_MANY_USER_ACTION_CALLS + READ_HISTORY + selectUser,
            ],
          ]);
          props.write.writeValue(data.buffer);
        }}
      >
        Read history
      </Button>

      <Button
        onclick={() => {
          const CHECK_TRANSMIT_OK = 0x0e;
          const data = Uint8Array.from([
            0x4d,
            0xff,
            0x00,
            0x02,
            CHECK_TRANSMIT_OK,
            334 + CHECK_TRANSMIT_OK,
          ]);
          props.write.writeValue(data.buffer);
        }}
      >
        checkTransmitOk
      </Button>

      <Button
        onclick={() => {
          const SERIAL_NUMBER = 0x0f;
          const data = Uint8Array.from([
            0x4d,
            0xff,
            0x00,
            0x03,
            SERIAL_NUMBER,
            0x00,
            335 + SERIAL_NUMBER,
          ]);
          props.write.writeValue(data.buffer);
        }}
      >
        readSerialNumber
      </Button>

      <Button
        onclick={() => {
          const READ_LAST_DATA = 0x07;
          const data = Uint8Array.from([
            0x4d,
            0xff,
            0x00,
            0x02,
            READ_LAST_DATA,
            334 + READ_LAST_DATA,
          ]);
          props.write.writeValue(data.buffer);
        }}
      >
        readLastData
      </Button>

      <Button
        onclick={() => {
          const DISCONNECT_BLE = 0x04;
          const data = Uint8Array.from([
            0x4d,
            0xff,
            0x00,
            0x02,
            DISCONNECT_BLE,
            334 + DISCONNECT_BLE,
          ]);
          props.write.writeValue(data.buffer);
        }}
      >
        disconnect
      </Button>

      <Button
        onclick={() => {
          const READ_DEVICE_TIME = 0x0c;
          const data = Uint8Array.from([
            0x4d,
            0xff,
            0x00,
            0x02,
            READ_DEVICE_TIME,
            334 + READ_DEVICE_TIME,
          ]);
          props.write.writeValue(data.buffer);
        }}
      >
        readDeviceTime
      </Button>

      <Button
        onclick={() => {
          const READ_DEVICE_INFO = 0x0b;
          const data = Uint8Array.from([
            0x4d,
            0xff,
            0x00,
            0x02,
            READ_DEVICE_INFO,
            334 + READ_DEVICE_INFO,
          ]);
          props.write.writeValue(data.buffer);
        }}
      >
        readDeviceInfo
      </Button>

      <Button
        onclick={() => {
          const READ_USER_ID_AND_VERSION_DATA = 0x05;
          const data = Uint8Array.from([
            0x4d,
            0xff,
            0x00,
            0x02,
            READ_USER_ID_AND_VERSION_DATA,
            334 + READ_USER_ID_AND_VERSION_DATA,
          ]);
          props.write.writeValue(data.buffer);
        }}
      >
        readUserAndVersionData
      </Button>
    </div>
  );
}

export function App() {
  return (
    <div>
      <CheckPermission />
    </div>
  );
}
