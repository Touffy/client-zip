;; inspired by https://create.stephan-brumme.com/crc32/
(module
  (memory (export "m") 2)
  ;; this function should be called once to initialize the precomputed CRC table for each byte
  (func $genTable (local $crc i32) (local $i i32) (local $j i32)
    (loop
      (local.set $crc (local.get $i))
      (local.set $j (i32.const 0))
      (loop
        (local.set $crc (i32.xor
          (i32.shr_u (local.get $crc) (i32.const 1))
          (i32.mul (i32.and (local.get $crc) (i32.const 1)) (i32.const 0xEDB88320))
        ))
        (local.tee $j (i32.add (local.get $j) (i32.const 1)))
        (br_if 0 (i32.ne (i32.const 8)))
      )
      (i32.store ;; store table in the first mem page
        (i32.shl (local.get $i) (i32.const 2))
        (local.get $crc))
      (local.tee $i (i32.add (local.get $i) (i32.const 1)))
      (br_if 0 (i32.ne (i32.const 0x100)))
    )
  )
  ;; this computes the CRC32 of what you put in the module's second page of Memory
  ;; (do not overwrite the first page!)
  (func $crc32 (param $len i32) (param $crc i32) (result f64) (local $i i32)
    (local.set $crc (i32.xor (local.get $crc) (i32.const -1)))
    (local.set $i (i32.const 0x10000))
    (local.set $len (i32.add (i32.const 0x10000) (local.get $len)))
    (loop
      (i32.and (local.get $crc) (i32.const 0xFF))
      (i32.load8_u (local.get $i))
      i32.xor ;; crc & 0xFF ^ byte
      (i32.shl (i32.const 2)) ;; times 4 because it's an array of 4-byte values we're addressing
      i32.load ;; get the precomputed CRC for that byte
      (i32.shr_u (local.get $crc) (i32.const 8)) ;; c >>> 8
      i32.xor ;; the whole operation: crc >>> 8 ^ byteTable[crc & 0xFF ^ byte]
      local.set $crc ;; store the updated CRC
      (local.tee $i (i32.add (local.get $i) (i32.const 1)))
      (br_if 0 (i32.lt_u (local.get $len)))
    )
    (i32.xor (local.get $crc) (i32.const -1))
    f64.convert_i32_u ;; return a positive Number
  )
  (export "t" (func $genTable))
  (export "c" (func $crc32))
)
