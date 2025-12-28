# HQX-CLI Development Rules

## STRICT RULES - Source Code Protection with Cython

### Files to Compile as .so (Protected Binary)

Compile all algo/strategy files using Cython to protect the source code.

| Source File | Compiled Output |
|-------------|-----------------|
| `hqx/core/strategy.py` | `strategy.so` |
| `hqx/core/signals.py` | `signals.so` |
| `hqx/core/engine.py` | `engine.so` |

### Compilation Steps

1. **Rename .py to .pyx**
   ```bash
   mv hqx/core/strategy.py hqx/core/strategy.pyx
   mv hqx/core/signals.py hqx/core/signals.pyx
   mv hqx/core/engine.py hqx/core/engine.pyx
   ```

2. **Create setup.py with cythonize**
   ```python
   from setuptools import setup
   from Cython.Build import cythonize

   setup(
       ext_modules=cythonize([
           "hqx/core/strategy.pyx",
           "hqx/core/signals.pyx",
           "hqx/core/engine.pyx",
       ], compiler_directives={'language_level': "3"})
   )
   ```

3. **Build with Cython**
   ```bash
   python setup.py build_ext --inplace
   ```

4. **Delete original .pyx files after build**
   ```bash
   rm -f hqx/core/strategy.pyx
   rm -f hqx/core/signals.pyx
   rm -f hqx/core/engine.pyx
   ```

5. **Update imports to use compiled .so modules**
   - Imports remain the same: `from hqx.core import strategy, signals, engine`
   - Python automatically loads `.so` files when `.py` is not present

### Files to Keep as Normal Python (Visible is OK)

These files do NOT need protection and should remain as readable `.py`:

- `cli.py` - CLI interface
- `config.py` - Configuration
- `connectors/rithmic.py` - Rithmic connector
- `connectors/projectx.py` - ProjectX connector

### Important Notes

- The compiled `.so` files are **unreadable binary** - source code is protected
- Never commit `.pyx` files to git after compilation
- Always test imports after compilation
- Add `*.so` to `.gitignore` if distributing source, or include them for binary distribution
