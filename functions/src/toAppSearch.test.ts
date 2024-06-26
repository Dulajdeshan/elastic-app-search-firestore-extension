import { toAppSearch } from "./toAppSearch";

describe("toAppSearch", () => {
  let originalValue: string | undefined;

  beforeAll(() => {
    originalValue = process.env.APP_SEARCH_ENGINE_NAME;
  });

  afterAll(() => {
    process.env.APP_SEARCH_ENGINE_NAME = originalValue;
  });

  beforeEach(() => {
    process.env.INDEXED_FIELDS = "foo,bar";
  });

  it('should only use fields from documents that have been marked as "indexed"', () => {
    // So it should only add foo and bar to the indexed object because that's all we have specified here
    process.env.INDEXED_FIELDS = "foo,bar";

    expect(
      toAppSearch({
        foo: "foo",
        bar: "bar",
        baz: "baz",
      }),
    ).toEqual({
      foo: "foo",
      bar: "bar",
    });
  });

  it("should lowercase field names before indexing", () => {
    process.env.INDEXED_FIELDS = "Foo,Bar";

    expect(
      toAppSearch({
        Foo: "foo",
        Bar: "bar",
        Baz: "baz",
      }),
    ).toEqual({
      foo: "foo",
      bar: "bar",
    });
  });

  it("will strip characters that are not alpha-numeric or underscores", () => {
    process.env.INDEXED_FIELDS = "a大,a1-b-c,d e_f,大";

    expect(
      toAppSearch({
        a大: "a大",
        "a1-b-c": "a1-b-c",
        "d e_f": "d e_f",
        大: "大",
      }),
    ).toEqual({
      a: "a大",
      a1bc: "a1-b-c",
      de_f: "d e_f",
      // 大 is ommited entirely because it serialized to an empty string
    });
  });

  it("what happens when multiple fields end up processing to the same field name?", () => {
    process.env.INDEXED_FIELDS = "A,a,a大";

    expect(
      toAppSearch({
        A: "A",
        a: "a",
        a大: "a大",
      }),
    ).toEqual({
      a: "a大",
    });
  });

  describe("renaming", () => {
    it("should let users specify alternate names for fields using the `::` syntax", () => {
      process.env.INDEXED_FIELDS = "A,a::a1,a大::a2";

      expect(
        toAppSearch({
          A: "A",
          a: "a",
          a大: "a大",
        }),
      ).toEqual({
        a: "A",
        a1: "a",
        a2: "a大",
      });
    });

    it("will look for the literal field first, before interpreting `::` as renaming syntax", () => {
      process.env.INDEXED_FIELDS = "A,a::a1,a大::a2";

      expect(
        toAppSearch({
          A: "A",
          "a::a1": "a",
          a大: "a大",
        }),
      ).toEqual({
        a: "A",
        aa1: "a",
        a2: "a大",
      });
    });
  });

  describe("nested fields", () => {
    it("will index nested fields that are specified as a separate field in app search", () => {
      process.env.INDEXED_FIELDS = "foo,bar__baz__qux";

      expect(
        toAppSearch({
          foo: "foo",
          bar: {
            baz: {
              qux: "test",
            },
          },
        }),
      ).toEqual({
        foo: "foo",
        bar__baz__qux: "test",
      });
    });

    it("will look for the literal field first, before looking for the nested field", () => {
      process.env.INDEXED_FIELDS = "foo,bar__baz__qux";

      expect(
        toAppSearch({
          bar__baz__qux: "bar__baz__qux",
          foo: "foo",
          bar: {
            baz: {
              qux: "qux",
            },
          },
        }),
      ).toEqual({
        foo: "foo",
        // App search doesn't support dot notation so we need to join them with "__"
        bar__baz__qux: "bar__baz__qux",
      });
    });
  });

  describe("field types", () => {
    // This section just explicitly spells out how we'll handle each data type firestore supports
    // https://firebase.google.com/docs/firestore/manage-data/data-types

    it("should handle 'map' data type fields", () => {
      process.env.INDEXED_FIELDS = "baz";

      expect(
        toAppSearch({
          baz: {
            qux: "qux",
            quux: "quux",
            quuz: "quuz",
          },
        }),
        // When this is sent to app search it will be converted to stringified JSON
      ).toEqual({
        baz: {
          qux: "qux",
          quux: "quux",
          quuz: "quuz",
        },
      });
    });

    it("should handle numeric fields", () => {
      process.env.INDEXED_FIELDS = "baz";

      expect(
        toAppSearch({
          baz: 1,
        }),
        // After this is sent to app search it will be converted from a number to a string
      ).toEqual({
        baz: 1,
      });
    });

    it("should handle boolean fields", () => {
      process.env.INDEXED_FIELDS = "baz";

      expect(
        toAppSearch({
          baz: true,
        }),
        // After this is sent to app search it will be converted from a boolean to a string
      ).toEqual({
        baz: true,
      });
    });

    it("should handle array fields", () => {
      process.env.INDEXED_FIELDS = "a,b,c,d,e,f";

      expect(
        toAppSearch({
          a: ["a", "b", "c"],
          b: ["a", 1, true],
          c: [{ a: "a" }, { b: "b" }],
          d: [
            {
              _latitude: 41.12,
              _longitude: -71.34,
            },
            {
              _seconds: 1631213624,
              _nanoseconds: 176000000,
            },
          ],
          e: [
            {
              time: {
                _seconds: 1631213624,
                _nanoseconds: 176000000,
              },
            },
          ],
          f: ["a", ["b"]],
        }),
      ).toEqual({
        // ["a", "b", "c"] is passed is not touched, an array of strings is valid in app search
        a: ["a", "b", "c"],
        // ["a", 1, true] is passed is not touched, an array of simple values is valid in app search
        b: ["a", 1, true],
        // [{ a: "a" }, { b: "b" }] is passed is not touched, an array of objects is valid in app search, they will just be serialized to strings
        c: [{ a: "a" }, { b: "b" }],
        // geo values and date values are converted to app search format even if they are in an array
        d: ["41.12,-71.34", "2021-09-09T18:53:44.000Z"],
        // if geo values or date values are NESTED inside of an object in an array, they are NOT converted, since objects are just converted to strings on the app search side
        e: [
          {
            time: {
              _seconds: 1631213624,
              _nanoseconds: 176000000,
            },
          },
        ],
        // ["a", ["b"]] nested arrays are dropped before sending them to app search, because app search does not support them
        f: ["a"],
      });
    });

    it("should handle date data types by converting to an ISO string", () => {
      process.env.INDEXED_FIELDS = "baz";

      expect(
        toAppSearch({
          baz: {
            _seconds: 1631213624,
            _nanoseconds: 176000000,
          },
        }),
      ).toEqual({
        baz: "2021-09-09T18:53:44.000Z",
      });
    });

    it("should handle geo data types by converting to a geo string", () => {
      process.env.INDEXED_FIELDS = "baz";

      expect(
        toAppSearch({
          baz: {
            _latitude: 41.12,
            _longitude: -71.34,
          },
        }),
      ).toEqual({
        baz: "41.12,-71.34",
      });
    });

    it("should handle null data types", () => {
      process.env.INDEXED_FIELDS = "baz";

      expect(
        toAppSearch({
          baz: null,
        }),
      ).toEqual({
        // This is an actual data type in firestore, app search can support it so we just pass it through as null
        baz: null,
      });
    });

    it("should handle reference data types", () => {
      process.env.INDEXED_FIELDS = "baz";

      expect(
        toAppSearch({
          baz: {
            _firestore: {
              projectId: "nationalparks",
            },
            _path: {
              segments: ["nationalparks", "123"],
            },
            _converter: {},
          },
        }),
      ).toEqual({
        // References will end up getting converted to serialized JSON objects of the following format, this is probably
        // unexpected for the user.
        baz: {
          _firestore: {
            projectId: "nationalparks",
          },
          _path: {
            segments: ["nationalparks", "123"],
          },
          _converter: {},
        },
      });
    });
  });

  it("should handle missing, null, or undefined values", () => {
    // So it should only add foo and bar to the indexed object because that's all we have specified here
    process.env.INDEXED_FIELDS = "foo,bar,baz.qux";

    expect(
      toAppSearch({
        foo: null,
        bar: undefined,
      }),
    ).toEqual({
      foo: null,
    });
  });

  it("not fail if INDEXED_FIELDS config is missing", () => {
    process.env.INDEXED_FIELDS = undefined;

    expect(
      toAppSearch({
        foo: "foo",
        bar: "bar",
      }),
    ).toEqual({});
  });

  it("not fail if INDEXED_FIELDS is something weird", () => {
    process.env.INDEXED_FIELDS = "this is just totally invalid garbage";

    expect(
      toAppSearch({
        foo: "foo",
        bar: "bar",
      }),
    ).toEqual({});
  });

  it("should handle empty field config and extra space", () => {
    process.env.INDEXED_FIELDS = ",,, foo,  ,   ,, bar";

    expect(
      toAppSearch({
        foo: "foo",
        bar: "bar",
      }),
    ).toEqual({
      foo: "foo",
      bar: "bar",
    });
  });
});
