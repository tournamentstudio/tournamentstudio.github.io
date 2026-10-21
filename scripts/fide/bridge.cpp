#include <emscripten/emscripten.h>
#include <sstream>
#include <string>
#include <fileformats/trf.h>
#include <swisssystems/dutch.h>
#include <swisssystems/common.h>

extern "C" EMSCRIPTEN_KEEPALIVE const char *pair_dutch(const char *text) {
  static std::string output;
  try {
    std::istringstream input(text);
    auto tournament = fileformats::trf::readFile(input, true);
    if (tournament.initialColor == tournament::COLOR_NONE)
      throw std::invalid_argument("The initial color is required.");
    tournament.updateRanks();
    tournament.computePlayerData();
    auto pairs = swisssystems::dutch::computeMatching(std::move(tournament));
    swisssystems::sortResults(pairs, tournament);
    std::ostringstream result;
    result << "OK\n";
    for (const auto &pair : pairs)
      result << pair.white + 1u << ' '
             << (pair.white == pair.black ? 0u : pair.black + 1u) << '\n';
    output = result.str();
  } catch (const std::exception &error) {
    output = "ERROR\n" + std::string(error.what());
  } catch (...) {
    output = "ERROR\nThe pairing engine could not process this tournament.";
  }
  return output.c_str();
}
