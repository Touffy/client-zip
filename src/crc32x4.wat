;; inspired by https://create.stephan-brumme.com/crc32/
(module
  ;; reusing the memory from the basic (non-SIMD) crc32 instance, which should already have 1kB of precomputed CRCs
  (memory (import "m" "m") 2)
  ;; this function should be called once to initialize 3 more precomputed CRC tables for slice-by-4
  (func $genTable (local $crc i32) (local $i i32) (local $j i32)
    (loop
      (local.set $j (i32.const 0))
      (loop
        (i32.load (i32.or (local.get $j) (local.get $i)))
        local.tee $crc

        (i32.and (i32.const 0xFF))
        (i32.shl (i32.const 2))
        i32.load

        (i32.shr_u  (local.get $crc) (i32.const 8))
        (local.set $crc (i32.xor))

        (local.tee $j (i32.add (local.get $j) (i32.const 0x400)))
        (i32.or (local.get $i))

        local.get $crc
        i32.store
        (br_if 0 (i32.ne (local.get $j) (i32.const 0xC00)))
      )
      (local.tee $i (i32.add (local.get $i) (i32.const 4)))
      (br_if 0 (i32.ne (i32.const 0x400)))
    ) ;; in total, the tables occupy the first 4 kB of the first mem page
  )
  ;; this computes the CRC32 of what you put in the module's second page of Memory
  ;; (do not overwrite the first page!)
  (func $crc32 (param $len i32) (param $crc i32) (result f64) (local $i i32) (local $l8 i32) (local $v v128)
    (local.set $crc (i32.xor (local.get $crc) (i32.const -1)))
    (local.set $i (i32.const 0x10000))
    (local.tee $len (i32.add (i32.const 0x10000) (local.get $len)))
    i32.const 2
    i32.shr_s
    i32.const 2
    i32.shl
    local.tee $l8

    (if (i32.ge_u (i32.const 0x10004))
    (loop
      (i32.xor (local.get $crc) (i32.load (local.get $i)))

      i32x4.splat
      v128.const i32x4 0xFFFFFF03 0xFFFFFF02 0xFFFFFF01 0xFFFFFF00
      i8x16.swizzle ;; this was called 'v8x16.swizzle' if you have an older WABT

      (i32x4.shl (i32.const 2))
      v128.const i32x4 0x00000000 0x00000400 0x00000800 0x00000C00
      v128.or
      local.tee $v
      (i32.load (i32x4.extract_lane 0))

      local.get $v
      (i32.load (i32x4.extract_lane 1))
      i32.xor

      local.get $v
      (i32.load (i32x4.extract_lane 2))
      i32.xor

      local.get $v
      (i32.load (i32x4.extract_lane 3))
      i32.xor

      local.set $crc ;; store the updated CRC
      (local.tee $i (i32.add (local.get $i) (i32.const 4)))
      (br_if 0 (i32.ne (local.get $l8)))
    ))

    (if (i32.lt_u (local.get $i) (local.get $len))
    ;; basic Sarwate algorithm for the last remaining bytes
    (loop
      (i32.and (local.get $crc) (i32.const 0xFF))
      (i32.load8_u (local.get $i))
      i32.xor
      (i32.shl (i32.const 2))
      i32.load
      (i32.shr_u (local.get $crc) (i32.const 8))
      i32.xor
      local.set $crc
      (local.tee $i (i32.add (local.get $i) (i32.const 1)))
      (br_if 0 (i32.lt_u (local.get $len)))
    ))
    (i32.xor (local.get $crc) (i32.const -1))
    f64.convert_i32_u ;; return a positive Number
  )
  (export "t" (func $genTable))
  (export "c" (func $crc32))
)
