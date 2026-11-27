import { describe, expect, it } from "vitest";
import { extractSnippet, maskSiteName, parseSourceRef } from "./snippet";

const lines = (...ls: string[]) => ls.join("\n");

describe("parseSourceRef", () => {
  it("splits a README link into path, line and language", () => {
    expect(parseSourceRef("go/dsa/hash_table/hashmap.go#L6")).toEqual({
      path: "go/dsa/hash_table/hashmap.go",
      line: 6,
      lang: "go",
    });
    expect(parseSourceRef("python/dsa/dp/lis.py#L12")?.lang).toBe("python");
    expect(parseSourceRef("rust/dsa/hash_table/hashmap.rs")).toEqual({
      path: "rust/dsa/hash_table/hashmap.rs",
      line: 0,
      lang: "rust",
    });
  });

  it("skips files it can't highlight", () => {
    expect(parseSourceRef("system_design/url_shortener.md#L3")).toBeUndefined();
  });
});

const GO = lines(
  "package hashtable", //          1
  "",
  "/**", //                         3
  " * 1. Two Sum",
  " *",
  " * one-pass",
  " */",
  "func twoSum(nums []int, target int) []int {", // 8
  "\tseen := map[int]int{}",
  "\t/* a comment inside */",
  "\t// and another",
  "\treturn nil",
  "}",
  "",
  "func twoSumAlt(nums []int, target int) []int {", // 15
  "\treturn nil",
  "}",
  "",
  "/**", //                         19
  " * 383. Ransom Note",
  " */",
  "func canConstruct(a, b string) bool {",
  "\treturn true",
  "}",
);

describe("extractSnippet, Go", () => {
  it("takes the header comment and the code up to the next header", () => {
    const s = extractSnippet(GO, 4, "go");
    expect([s.first, s.last]).toEqual([3, 17]);
    expect(s.code.split("\n")[0]).toBe("/**");
    expect(s.code).toContain("func twoSumAlt");
    expect(s.code).not.toContain("Ransom");
  });

  it("runs to the end of the file for the last problem", () => {
    const s = extractSnippet(GO, 20, "go");
    expect([s.first, s.last]).toEqual([19, 24]);
  });

  it("keeps doc comments on a design problem's methods", () => {
    const src = lines(
      "/**",
      " * 146. LRU Cache",
      " */",
      "type LRUCache struct{}",
      "",
      "// Get returns the value, or -1.",
      "func (c *LRUCache) Get(key int) int { return -1 }",
      "",
      "// 155. Min Stack",
      "type MinStack struct{}",
    );
    const s = extractSnippet(src, 2, "go");
    expect(s.code).toContain("func (c *LRUCache) Get");
    expect(s.code).not.toContain("Min Stack");
  });

  it("starts at a run of line comments above the linked line", () => {
    const src = lines("x := 1", "", "// 20. Valid Parentheses", "// with a stack", "func isValid(s string) bool {", "\treturn true", "}");
    const s = extractSnippet(src, 5, "go");
    expect([s.first, s.last]).toEqual([3, 7]);
  });
});

const PY = lines(
  "from typing import List", //     1
  "",
  "",
  "class Solution:", //              4
  '    """',
  "    1. Two Sum",
  '    """',
  "",
  "    def twoSum(self, nums: List[int], target: int) -> List[int]:", // 9
  '        """Inner docstring."""',
  "        # a comment",
  "        return []",
  "",
  "    def helper(self) -> None:", // 14
  "        pass",
  "",
  '    """',
  "    383. Ransom Note",
  '    """',
  "",
  "    def canConstruct(self, a: str, b: str) -> bool:", // 21
  "        return True",
  "",
  "",
  "def outside() -> None:", //       25
  "    pass",
);

describe("extractSnippet, Python", () => {
  it("takes the docstring and the methods after it, dedented", () => {
    const s = extractSnippet(PY, 6, "python");
    expect([s.first, s.last]).toEqual([5, 15]);
    expect(s.code.split("\n").slice(0, 5)).toEqual(['"""', "1. Two Sum", '"""', "", "def twoSum(self, nums: List[int], target: int) -> List[int]:"]);
    expect(s.code).toContain("def helper");
  });

  it("stops where the class ends", () => {
    const s = extractSnippet(PY, 18, "python");
    expect([s.first, s.last]).toEqual([17, 22]);
  });

  it("ends at a header in a line comment", () => {
    const src = lines("class Solution:", "    # 1. Two Sum", "    def a(self): pass", "", "    # 2. Add", "    def b(self): pass");
    expect(extractSnippet(src, 2, "python").code).toBe("# 1. Two Sum\ndef a(self): pass");
  });
});

describe("extractSnippet, edges", () => {
  it("shows the whole file for a link to line 1", () => {
    const s = extractSnippet(GO, 1, "go");
    expect([s.first, s.last]).toEqual([1, 24]);
  });

  it("reads CRLF files and clamps a line past the end", () => {
    const s = extractSnippet(GO.replace(/\n/g, "\r\n") + "\r\n", 99, "go");
    expect(s.last).toBe(24);
    expect(s.code).not.toContain("\r");
  });
});

describe("maskSiteName", () => {
  it("abbreviates the site's name in any case", () => {
    expect(maskSiteName("same node type as LeetCode, see leetcode.com")).toBe("same node type as LC, see LC.com");
  });
});
