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
  let d: number[] = [];

  useReadCharacteristicData(
    () => props.read,
    (data) => {
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
    }
  );

  createEffect(() => {
    props.read.addEventListener("characteristicvaluechanged", (e) => {
      const value = props.read.value;
      console.log("read value", value);
      d = [...d, ...new Uint8Array(value!.buffer)];
      console.log("combined data:", d);
    });
    props.read.startNotifications();

    onCleanup(() => {
      props.read.stopNotifications();
    });
  });

  createEffect(() => {
    setTimeout(() => {
      console.log("write stuff");
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
      console.log("write stuff", data);
      props.write.writeValue(data.buffer);
    }, 2000);
  });

  return <>test</>;
}

export function App() {
  return (
    <div>
      <CheckPermission />
    </div>
  );
}
