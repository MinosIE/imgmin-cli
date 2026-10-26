{
  "targets": [
    {
      "target_name": "butteraugli",
      "sources": [
        "butteraugli.cc",
        "butteraugli_binding.cc"
      ],
      "include_dirs": [
        "<(module_root_dir)"
      ],
      "cflags_cc": [
        "-std=c++11",
        "-O2"
      ],
      "xcode_settings": {
        "MACOSX_DEPLOYMENT_TARGET": "10.15",
        "OTHER_CPLUSPLUSFLAGS": [
          "-std=c++11",
          "-O2"
        ]
      },
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1
        }
      }
    }
  ]
}
