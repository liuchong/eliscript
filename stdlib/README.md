# Standard Library

This directory will contain portable Eliscript functions and macros. React and
publishing support should be libraries here or in focused packages, not special
cases embedded throughout the compiler.

The compiler owns only React element construction and the automatic JSX
runtime contract. Higher-level component helpers belong here so React remains
a library target instead of a second component framework.
