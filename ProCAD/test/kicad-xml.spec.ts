import { describe, expect, it } from 'vitest';
import { NetlistFormatError, parseKicadXmlNetlist } from '../src/import/kicad-xml.js';

const XML = `<?xml version="1.0" encoding="utf-8"?>
<export version="E">
  <components>
    <comp ref="U1">
      <value>Arduino_UNO_R3</value>
      <fields>
        <field name="Footprint">Module:Arduino_UNO_R3</field>
        <field name="ProCAD.Firmware">fw/app.hex</field>
      </fields>
      <libsource lib="MCU_Module" part="Arduino_UNO_R3" description="Arduino UNO"/>
      <property name="ProCAD.Firmware" value="fw/app.hex"/>
      <property name="Sheetname" value="Root"/>
      <property name="exclude_from_sim"/>
    </comp>
    <comp ref="D1">
      <value>LED &amp; friends</value>
      <libsource lib="Device" part="LED" description="Light emitting diode"/>
      <property name="dnp"/>
    </comp>
  </components>
  <nets>
    <net code="1" name="/LED" class="Default">
      <node ref="U1" pin="28" pinfunction="D13" pintype="bidirectional"/>
      <node ref="D1" pin="2" pinfunction="A" pintype="passive"/>
    </net>
    <net code="2" name="GND" class="Default">
      <node ref="D1" pin="1" pinfunction="K" pintype="passive"/>
    </net>
  </nets>
</export>`;

describe('parseKicadXmlNetlist', () => {
  const netlist = parseKicadXmlNetlist(XML, 'design.xml', '/project');

  it('reads components, fields and flags', () => {
    expect(netlist.components).toEqual([
      {
        ref: 'U1',
        value: 'Arduino_UNO_R3',
        lib: 'MCU_Module',
        part: 'Arduino_UNO_R3',
        fields: { Footprint: 'Module:Arduino_UNO_R3', 'ProCAD.Firmware': 'fw/app.hex', Sheetname: 'Root' },
        excludedFromSim: true,
        dnp: false,
      },
      { ref: 'D1', value: 'LED & friends', lib: 'Device', part: 'LED', fields: {}, excludedFromSim: false, dnp: true },
    ]);
  });

  it('reads nets with pin names and types', () => {
    expect(netlist.nets[0]).toEqual({
      code: 1,
      name: '/LED',
      nodes: [
        { ref: 'U1', pin: '28', pinFunction: 'D13', pinType: 'bidirectional' },
        { ref: 'D1', pin: '2', pinFunction: 'A', pinType: 'passive' },
      ],
    });
    expect(netlist.nets[1]!.nodes).toHaveLength(1);
  });

  it('rejects files that are not KiCad netlists', () => {
    expect(() => parseKicadXmlNetlist('<foo/>', 'x.xml', '.')).toThrow(NetlistFormatError);
  });
});
