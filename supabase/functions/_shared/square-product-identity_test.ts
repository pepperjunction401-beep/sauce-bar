import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { resolveSquareProduct } from "./square-product-identity.ts";

Deno.test("variation resolves authoritative parent Square item mapping", () => {
 const result = resolveSquareProduct("var-1", { type:"ITEM_VARIATION",id:"var-1",item_variation_data:{item_id:"item-1"} }, new Map([["item-1","pj-1"]]));
 assertEquals(result, {squareItemId:"item-1",squareVariationId:"var-1",productId:"pj-1"});
});
Deno.test("variation mapping works when mapped directly", () => {
 assertEquals(resolveSquareProduct("var-1",{type:"ITEM_VARIATION",id:"var-1"},new Map([["var-1","pj-1"]])).productId,"pj-1");
});
Deno.test("unmapped historical product remains explicitly unmapped", () => {
 assertEquals(resolveSquareProduct("old-1",undefined,new Map()).productId,null);
});
Deno.test("conflicting mappings fail closed", () => {
 assertThrows(()=>resolveSquareProduct("var-1",{type:"ITEM_VARIATION",id:"var-1",item_variation_data:{item_id:"item-1"}},new Map([["var-1","pj-1"],["item-1","pj-2"]])));
});
