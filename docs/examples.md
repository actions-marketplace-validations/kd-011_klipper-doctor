# Examples

What Klipper logs, then what klipper-doctor says about it. These are real outputs from test logs built from the message formats in the Klipper source. None of them is anyone's real log, and `test/readme.test.mjs` fails if the wording here stops matching the engine.

**Lost communication**

```text
Timeout with MCU 'mcu' (eventtime=5014.912345)
Transition to shutdown state: Lost communication with MCU 'mcu'
```

```text
error   Lost communication with MCU [mcu-lost-communication]
        Klipper lost contact with MCU 'mcu' and shut down. The Klipper FAQ says this
        is commonly caused by hardware errors on the USB connection: a poor cable or
        loose plugs, a weak power supply for the host (look for "under voltage"
        warnings), an overloaded printer power supply, frayed or crimped stepper,
        heater or sensor wires, or the printer and host 5V supplies being mixed.
        Fix: Use a good USB cable with secure plugs, a good power supply for the host,
        and check the printer wiring and power supply load.
```

**Timer too close**

```text
MCU 'mcu' shutdown: Timer too close
```

```text
error   Timer too close [mcu-timer-too-close]
        MCU 'mcu' shut down with "Timer too close": a command reached it after the
        time it was scheduled to run. Klipper's own hint is that this often indicates
        the host computer is overloaded: other processes using too much CPU, high swap
        use, disk errors, overheating or unstable voltage.
        Fix: Check the host for processes using a lot of CPU, high swap use, disk
        errors, overheating or unstable power, then run FIRMWARE_RESTART.
```

**A TMC driver that will not answer**

```text
Unable to read tmc uart 'stepper_x' register IFCNT
```

```text
error   Cannot talk to a TMC driver [tmc-comm]
        Klipper could not read register IFCNT on the TMC driver for stepper_x over
        UART. The Klipper TMC guide says to make sure motor power is enabled, because
        the driver generally needs it before it will answer. If this started right
        after flashing Klipper for the first time, the driver may have been left in a
        state Klipper cannot use: remove all power, USB and mains, for several
        seconds. Otherwise it is usually wrong UART wiring or wrong UART pin settings
        in the config.
        Fix: Turn motor power on, then power-cycle the printer fully; if it persists,
        check the uart_pin, tx_pin and uart_address settings against the wiring.
```

**A command Klipper refused**

```text
bed_mesh: min/max points too close together
```

```text
warning A command failed: bed_mesh: min/max points too close together [command-error]
        Klipper refused a command and logged "bed_mesh: min/max points too close
        together", which comes from klippy/extras/bed_mesh.py in the Klipper source.
        Klipper keeps running after a command error, but a print from the virtual SD
        card stops on one.
        Fix: The message says what Klipper wanted. If a macro or the slicer start
        G-code ran the command, fix it there.
```

**An option Klipper removed** (the config report: no crash needed)

```text
[extruder]
...
pid_integral_max = 0.2
```

```text
error   pid_integral_max was removed from Klipper in [extruder] [removed-option]
        Config_Changes lists pid_integral_max as removed on 2021-11-02. This log's
        Klipper (v0.12.0-250-g1a2b3c4d) is newer than that, so it rejects the option.
        Delete the line.
        Fix: Delete the line.
```

Every finding also carries the line numbers it came from and a link to the Klipper docs page or source file behind it.

