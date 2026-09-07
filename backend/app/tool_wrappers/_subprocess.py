"""Helper compartilhado pros wrappers de ferramentas externas (subprocess)."""

import subprocess


def run_tool(cmd: list[str], *, input: str | None = None, timeout: int) -> str:
    """
    Executa `cmd` e retorna o stdout. Levanta RuntimeError se o binario nao
    existir, estourar o timeout, ou terminar com codigo de saida != 0 - pra
    que uma falha real da ferramenta nao seja confundida com um resultado
    vazio legitimo.
    """
    try:
        result = subprocess.run(
            cmd,
            input=input,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError(f"Falha ao executar {cmd[0]}: {exc}") from exc

    if result.returncode != 0:
        raise RuntimeError(
            f"{cmd[0]} terminou com codigo {result.returncode}: {result.stderr.strip()}"
        )

    return result.stdout
