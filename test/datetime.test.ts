import { formatDOSDateTime } from "../src/datetime"

describe("The DOS datetime module", () => {
  // warning: this test works only in the Europe/Paris or equivalent timezone
  it("should encode dates to local 32-bit DOS format", () => {
    const date = new Date("2020-02-15T11:24:18+01:00")
    const actual = formatDOSDateTime(date)
    const expected = 0x095b4f50
    expect(actual).toEqual(expected)
  })
})
